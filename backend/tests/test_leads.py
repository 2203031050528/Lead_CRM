import pytest

from apps.audit.models import AuditLog
from apps.contacts.models import Company, Contact
from apps.deals.models import Deal, PipelineStage
from apps.leads.models import Lead, Tag
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db
URL = "/api/v1/leads/"


@pytest.fixture
def leads(rep, other_rep):
    return {
        "mine": Lead.objects.create(name="Mine", owner=rep, company_name="Acme"),
        "theirs": Lead.objects.create(name="Theirs", owner=other_rep),
    }


def ids(response):
    return {row["id"] for row in response.json()["results"]}


def test_rep_sees_only_own_leads(api, rep, leads):
    c = api(rep)
    assert ids(c.get(URL)) == {leads["mine"].pk}
    assert c.get(f"{URL}{leads['theirs'].pk}/").status_code == 404
    assert c.patch(f"{URL}{leads['theirs'].pk}/", {"name": "x"}).status_code == 404


@pytest.mark.parametrize("role", ["admin_user", "manager"])
def test_manager_and_admin_see_all(api, request, role, leads):
    assert ids(api(request.getfixturevalue(role)).get(URL)) == {lead.pk for lead in leads.values()}


def test_rep_create_auto_assigns_self(api, rep, other_rep):
    c = api(rep)
    r = c.post(URL, {"name": "New"})
    assert r.status_code == 201 and r.json()["owner"] == rep.pk
    r = c.post(URL, {"name": "Sneaky", "owner": other_rep.pk})
    assert r.status_code == 400 and "owner" in r.json()["errors"]


def test_rep_cannot_reassign_or_delete(api, rep, other_rep, leads):
    c = api(rep)
    lead = leads["mine"]
    assert c.patch(f"{URL}{lead.pk}/", {"owner": other_rep.pk}).status_code == 400
    assert c.patch(f"{URL}{lead.pk}/", {"status": "contacted"}).status_code == 200
    assert c.delete(f"{URL}{lead.pk}/").status_code == 403


def test_manager_reassigns_and_owner_is_notified(api, manager, other_rep, leads):
    lead = leads["mine"]
    r = api(manager).patch(f"{URL}{lead.pk}/", {"owner": other_rep.pk})
    assert r.status_code == 200
    assert Notification.objects.filter(recipient=other_rep, message__contains="Mine").exists()
    log = AuditLog.objects.get(model="lead", object_id=str(lead.pk), action="update")
    assert log.changes["owner_id"][1] == other_rep.pk and log.actor == manager


def test_manager_can_delete_and_it_is_audited(api, manager, leads):
    lead = leads["theirs"]
    assert api(manager).delete(f"{URL}{lead.pk}/").status_code == 204
    assert AuditLog.objects.filter(model="lead", action="delete", object_id=str(lead.pk)).exists()


def test_search_filter_order(api, manager, rep, source):
    hot = Tag.objects.create(name="Hot")
    a = Lead.objects.create(
        name="Alice",
        email="alice@acme.io",
        owner=rep,
        source=source,
        status="qualified",
        estimated_value=500,
    )
    a.tags.add(hot)
    Lead.objects.create(name="Bob", phone="555-0100", owner=rep, estimated_value=100)
    c = api(manager)
    assert ids(c.get(URL, {"search": "acme"})) == {a.pk}
    assert len(ids(c.get(URL, {"search": "555-01"}))) == 1
    assert ids(c.get(URL, {"status": "qualified"})) == {a.pk}
    assert ids(c.get(URL, {"tag": hot.pk})) == {a.pk}
    assert ids(c.get(URL, {"source": source.pk})) == {a.pk}
    r = c.get(URL, {"ordering": "-estimated_value"}).json()["results"]
    assert [row["name"] for row in r] == ["Alice", "Bob"]
    assert c.get(URL, {"page_size": 1}).json()["count"] == 2


def test_status_cannot_be_set_to_converted_directly(api, rep, leads):
    r = api(rep).patch(f"{URL}{leads['mine'].pk}/", {"status": "converted"})
    assert r.status_code == 400 and "status" in r.json()["errors"]


def test_bulk_assign_manager_only(api, manager, rep, other_rep, leads):
    payload = {"ids": [leads["mine"].pk], "owner": other_rep.pk}
    assert api(rep).post(f"{URL}bulk_assign/", payload, format="json").status_code == 403
    r = api(manager).post(f"{URL}bulk_assign/", payload, format="json")
    assert r.json() == {"updated": 1}
    assert Lead.objects.get(pk=leads["mine"].pk).owner == other_rep


def test_bulk_status_respects_scope(api, rep, leads):
    c = api(rep)
    r = c.post(f"{URL}bulk_status/", {"ids": [leads["theirs"].pk], "status": "lost"}, format="json")
    assert r.status_code == 400
    r = c.post(f"{URL}bulk_status/", {"ids": [leads["mine"].pk], "status": "lost"}, format="json")
    assert r.json() == {"updated": 1}
    assert AuditLog.objects.filter(model="lead", action="update").count() == 1


def test_convert_lead(api, rep, leads, stage):
    lead = leads["mine"]
    lead.estimated_value = 1200
    lead.save()
    r = api(rep).post(f"{URL}{lead.pk}/convert/", {}, format="json")
    assert r.status_code == 201
    body = r.json()
    lead.refresh_from_db()
    assert lead.status == "converted" and lead.converted_contact_id == body["contact"]
    deal = Deal.objects.get(pk=body["deal"])
    assert deal.stage == stage and deal.value == 1200 and deal.owner == rep
    assert Company.objects.get(pk=body["company"]).name == "Acme"
    assert Contact.objects.get(pk=body["contact"]).company_id == body["company"]
    again = api(rep).post(f"{URL}{lead.pk}/convert/", {}, format="json")
    assert again.status_code == 400 and "already converted" in again.json()["detail"]


def test_convert_reuses_visible_company_and_can_skip_deal(api, rep, leads):
    existing = Company.objects.create(name="ACME", owner=rep)
    r = api(rep).post(f"{URL}{leads['mine'].pk}/convert/", {"create_deal": False}, format="json")
    assert r.json()["company"] == existing.pk and r.json()["deal"] is None


def test_convert_without_open_stage_fails_atomically(api, rep, leads):
    PipelineStage.objects.create(name="Won", is_won=True)
    r = api(rep).post(f"{URL}{leads['mine'].pk}/convert/", {}, format="json")
    assert r.status_code == 400
    assert not Contact.objects.exists()
    assert Lead.objects.get(pk=leads["mine"].pk).status == "new"


def test_lookup_tables_admin_write_only(api, admin_user, manager, rep):
    for user in (manager, rep):
        assert api(user).get("/api/v1/tags/").status_code == 200
        assert api(user).post("/api/v1/tags/", {"name": "X"}).status_code == 403
        assert api(user).post("/api/v1/lead-sources/", {"name": "X"}).status_code == 403
    assert (
        api(admin_user).post("/api/v1/tags/", {"name": "X", "color": "#ff0000"}).status_code == 201
    )
    assert api(admin_user).post("/api/v1/tags/", {"name": "Y", "color": "red"}).status_code == 400


def test_list_has_no_n_plus_one(api, manager, rep, source, django_assert_max_num_queries):
    tags = [Tag.objects.create(name=f"t{i}") for i in range(3)]
    for i in range(30):
        Lead.objects.create(name=f"L{i}", owner=rep, source=source).tags.set(tags)
    with django_assert_max_num_queries(6):
        assert api(manager).get(URL).status_code == 200
