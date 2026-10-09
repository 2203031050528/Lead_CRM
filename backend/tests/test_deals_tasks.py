from datetime import timedelta

import pytest
from django.utils import timezone

from apps.activities.models import Activity
from apps.contacts.models import Company, Contact
from apps.deals.models import Deal, PipelineStage
from apps.leads.models import Lead
from apps.notifications.models import Notification
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db


@pytest.fixture
def stages(db):
    return {
        "open": PipelineStage.objects.create(name="Open", order=0),
        "won": PipelineStage.objects.create(name="Won", order=1, is_won=True),
    }


def test_deal_visibility_and_stage_change(api, rep, other_rep, manager, stages):
    mine = Deal.objects.create(title="Mine", stage=stages["open"], owner=rep, value=100)
    theirs = Deal.objects.create(title="Theirs", stage=stages["open"], owner=other_rep)
    c = api(rep)
    assert [d["id"] for d in c.get("/api/v1/deals/").json()["results"]] == [mine.pk]
    assert c.get(f"/api/v1/deals/{theirs.pk}/").status_code == 404

    r = c.patch(f"/api/v1/deals/{mine.pk}/", {"stage": stages["won"].pk})
    assert r.status_code == 200 and r.json()["closed_at"] is not None
    act = Activity.objects.get(deal=mine)
    assert act.subject == "Stage changed: Open → Won" and act.user == rep
    r = c.patch(f"/api/v1/deals/{mine.pk}/", {"stage": stages["open"].pk})
    assert r.json()["closed_at"] is None

    summary = api(manager).get("/api/v1/deals/summary/").json()
    assert summary[0] == {"stage": stages["open"].pk, "name": "Open", "count": 2, "total": "100.00"}


def test_rep_cannot_link_deal_to_others_records(api, rep, other_rep, stages):
    foreign_contact = Contact.objects.create(first_name="X", owner=other_rep)
    foreign_company = Company.objects.create(name="Y", owner=other_rep)
    foreign_lead = Lead.objects.create(name="Z", owner=other_rep)
    for field, obj in (
        ("contact", foreign_contact),
        ("company", foreign_company),
        ("lead", foreign_lead),
    ):
        r = api(rep).post(
            "/api/v1/deals/", {"title": "D", "stage": stages["open"].pk, field: obj.pk}
        )
        assert r.status_code == 400 and field in r.json()["errors"], field


def test_stage_admin_write_and_reorder(api, admin_user, manager, stages):
    assert api(manager).post("/api/v1/stages/", {"name": "X"}).status_code == 403
    ids = [stages["won"].pk, stages["open"].pk]
    r = api(admin_user).post("/api/v1/stages/reorder/", {"ids": ids}, format="json")
    assert [s["id"] for s in r.json()] == ids
    bad = api(admin_user).post("/api/v1/stages/reorder/", {"ids": ids[:1]}, format="json")
    assert bad.status_code == 400
    Deal.objects.create(title="D", stage=stages["open"], owner=admin_user)
    assert api(admin_user).delete(f"/api/v1/stages/{stages['open'].pk}/").status_code == 400


def test_company_contacts_scoped(api, rep, other_rep, manager):
    co = Company.objects.create(name="Mine Co", owner=rep)
    Company.objects.create(name="Their Co", owner=other_rep)
    Contact.objects.create(first_name="A", owner=rep, company=co)
    r = api(rep).get("/api/v1/companies/").json()["results"]
    assert [(x["name"], x["contact_count"]) for x in r] == [("Mine Co", 1)]
    assert api(manager).get("/api/v1/companies/").json()["count"] == 2
    assert api(rep).get("/api/v1/contacts/", {"company": co.pk}).json()["count"] == 1
    assert api(rep).delete(f"/api/v1/companies/{co.pk}/").status_code == 403


def test_activities_scoped_to_parent_owner(api, rep, other_rep):
    mine = Lead.objects.create(name="M", owner=rep)
    theirs = Lead.objects.create(name="T", owner=other_rep)
    Activity.objects.create(subject="theirs", user=other_rep, lead=theirs)
    c = api(rep)
    r = c.post("/api/v1/activities/", {"type": "call", "subject": "Called", "lead": mine.pk})
    assert r.status_code == 201 and r.json()["user"] == rep.pk
    assert c.post("/api/v1/activities/", {"subject": "x", "lead": theirs.pk}).status_code == 400
    assert c.post("/api/v1/activities/", {"subject": "no parent"}).status_code == 400
    assert [a["subject"] for a in c.get("/api/v1/activities/").json()["results"]] == ["Called"]


def test_tasks_rep_scope_assignment_and_completion(api, rep, other_rep, manager):
    c = api(rep)
    r = c.post("/api/v1/tasks/", {"title": "Mine"})
    assert r.status_code == 201 and r.json()["assigned_to"] == rep.pk
    assert c.post("/api/v1/tasks/", {"title": "x", "assigned_to": other_rep.pk}).status_code == 400

    r = api(manager).post("/api/v1/tasks/", {"title": "For rep2", "assigned_to": other_rep.pk})
    assert r.status_code == 201
    assert Notification.objects.filter(recipient=other_rep, message__contains="For rep2").exists()
    assert [t["title"] for t in c.get("/api/v1/tasks/").json()["results"]] == ["Mine"]

    task = Task.objects.get(title="Mine")
    r = c.patch(f"/api/v1/tasks/{task.pk}/", {"is_done": True})
    assert r.json()["completed_at"] is not None
    r = c.patch(f"/api/v1/tasks/{task.pk}/", {"is_done": False})
    assert r.json()["completed_at"] is None


def test_task_buckets_and_reminder_rearm(api, rep):
    now = timezone.now()
    overdue = Task.objects.create(
        title="o",
        due_at=now - timedelta(hours=1),
        assigned_to=rep,
        created_by=rep,
        reminder_sent=True,
    )
    Task.objects.create(title="u", due_at=now + timedelta(days=3), assigned_to=rep, created_by=rep)
    Task.objects.create(
        title="d", due_at=now - timedelta(days=1), assigned_to=rep, created_by=rep, is_done=True
    )
    c = api(rep)

    def titles(bucket):
        return [t["title"] for t in c.get("/api/v1/tasks/", {"bucket": bucket}).json()["results"]]

    assert titles("overdue") == ["o"]
    assert titles("upcoming") == ["u"]
    c.patch(f"/api/v1/tasks/{overdue.pk}/", {"due_at": (now + timedelta(days=1)).isoformat()})
    overdue.refresh_from_db()
    assert overdue.reminder_sent is False


def test_notifications_are_private(api, rep, other_rep):
    n = Notification.objects.create(recipient=rep, message="hi")
    Notification.objects.create(recipient=other_rep, message="not yours")
    c = api(rep)
    assert c.get("/api/v1/notifications/unread_count/").json() == {"count": 1}
    assert c.patch(f"/api/v1/notifications/{n.pk}/", {"is_read": True}).status_code == 200
    assert c.get("/api/v1/notifications/unread_count/").json() == {"count": 0}
    other = Notification.objects.get(recipient=other_rep)
    assert c.patch(f"/api/v1/notifications/{other.pk}/", {"is_read": True}).status_code == 404


@pytest.mark.parametrize("role,code", [("admin_user", 200), ("manager", 403), ("rep", 403)])
def test_audit_log_admin_only(api, request, role, code):
    assert api(request.getfixturevalue(role)).get("/api/v1/audit-logs/").status_code == code


def test_global_search_scoped(api, rep, other_rep):
    Lead.objects.create(name="Zebra mine", owner=rep)
    Lead.objects.create(name="Zebra theirs", owner=other_rep)
    r = api(rep).get("/api/v1/search/", {"q": "zebra"}).json()
    assert [x["label"] for x in r["leads"]] == ["Zebra mine"]


def test_unauthenticated_is_rejected(api):
    r = api().get("/api/v1/leads/")
    assert r.status_code == 403 and set(r.json()) == {"detail", "errors"}


def test_task_buckets_follow_viewer_timezone(api, rep):
    """'Today' ends at the viewer's local midnight, passed as ?tz=."""
    from datetime import datetime, time
    from zoneinfo import ZoneInfo

    now = timezone.now()
    results = {}
    for tz_name in ("Pacific/Kiritimati", "Pacific/Pago_Pago"):  # UTC+14 and UTC-11
        tz = ZoneInfo(tz_name)
        local_today = timezone.localtime(now, tz).date()
        end_of_today = datetime.combine(local_today + timedelta(days=1), time.min, tzinfo=tz)
        Task.objects.all().delete()
        Task.objects.create(
            title="later today",
            due_at=now + (end_of_today - now) / 2,
            assigned_to=rep,
            created_by=rep,
        )
        Task.objects.create(
            title="after midnight",
            due_at=end_of_today + timedelta(minutes=1),
            assigned_to=rep,
            created_by=rep,
        )

        def titles(bucket, tz_name=tz_name):
            r = api(rep).get("/api/v1/tasks/", {"bucket": bucket, "tz": tz_name})
            return [t["title"] for t in r.json()["results"]]

        results[tz_name] = (titles("today"), titles("upcoming"))
    for today, upcoming in results.values():
        assert today == ["later today"]
        assert upcoming == ["after midnight"]


def test_task_bucket_ignores_invalid_timezone(api, rep):
    Task.objects.create(title="t", assigned_to=rep, created_by=rep)
    for bad in ("Not/AZone", "../../etc/passwd", "x" * 300):
        r = api(rep).get("/api/v1/tasks/", {"bucket": "upcoming", "tz": bad})
        assert r.status_code == 200 and r.json()["count"] == 1


def test_completed_tasks_order_by_completion(api, rep):
    c = api(rep)
    first = c.post("/api/v1/tasks/", {"title": "first"}).json()["id"]
    second = c.post("/api/v1/tasks/", {"title": "second"}).json()["id"]
    c.patch(f"/api/v1/tasks/{first}/", {"is_done": True})
    c.patch(f"/api/v1/tasks/{second}/", {"is_done": True})
    r = c.get("/api/v1/tasks/", {"is_done": "true", "ordering": "-completed_at"}).json()
    assert [t["title"] for t in r["results"]] == ["second", "first"]


def test_activity_edit_and_delete_permissions(api, rep, manager):
    lead = Lead.objects.create(name="L", owner=rep)
    by_manager = Activity.objects.create(subject="manager call", user=manager, lead=lead)
    by_rep = Activity.objects.create(subject="rep note", user=rep, lead=lead)
    c = api(rep)
    # The rep can see the manager's activity on their lead but not change it.
    assert c.patch(f"/api/v1/activities/{by_manager.pk}/", {"subject": "x"}).status_code == 403
    assert c.delete(f"/api/v1/activities/{by_manager.pk}/").status_code == 403
    assert c.patch(f"/api/v1/activities/{by_rep.pk}/", {"subject": "edited"}).status_code == 200
    other = Lead.objects.create(name="Other", owner=rep)
    moved = c.patch(f"/api/v1/activities/{by_rep.pk}/", {"lead": other.pk})
    assert moved.status_code == 400
    assert api(manager).delete(f"/api/v1/activities/{by_rep.pk}/").status_code == 204


def test_lookups_report_usage_counts(api, admin_user, rep, stage, source):
    from apps.leads.models import Tag

    tag = Tag.objects.create(name="Hot")
    Lead.objects.create(name="L", owner=rep, source=source).tags.add(tag)
    Deal.objects.create(title="D", owner=rep, stage=stage)
    c = api(admin_user)
    assert [(s["name"], s["lead_count"]) for s in c.get("/api/v1/lead-sources/").json()] == [
        ("Website", 1)
    ]
    assert c.get("/api/v1/tags/").json()[0]["lead_count"] == 1
    assert c.get("/api/v1/stages/").json()[0]["deal_count"] == 1
    reordered = c.post("/api/v1/stages/reorder/", {"ids": [stage.pk]}, format="json").json()
    assert reordered[0]["deal_count"] == 1


def test_admin_cannot_demote_or_deactivate_self(api, admin_user, rep):
    c = api(admin_user)
    r = c.patch(f"/api/v1/users/{admin_user.pk}/", {"role": "rep"})
    assert r.status_code == 400 and "own role" in r.json()["errors"]["role"][0]
    assert c.patch(f"/api/v1/users/{admin_user.pk}/", {"is_active": False}).status_code == 400
    assert c.patch(f"/api/v1/users/{admin_user.pk}/", {"first_name": "Ada"}).status_code == 200
    assert c.patch(f"/api/v1/users/{rep.pk}/", {"role": "manager"}).json()["role"] == "manager"
    assert c.patch(f"/api/v1/users/{rep.pk}/", {"is_active": False}).json()["is_active"] is False
    assert c.patch(f"/api/v1/users/{rep.pk}/", {"is_active": True}).json()["is_active"] is True
