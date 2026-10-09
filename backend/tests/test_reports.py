from datetime import date, timedelta
from zoneinfo import ZoneInfo

import pytest
from django.utils import timezone

from apps.deals.models import Deal, PipelineStage
from apps.leads.models import Lead, LeadSource
from apps.reports.services import add_months, period_bounds

pytestmark = pytest.mark.django_db
TZ = "Asia/Kolkata"


@pytest.fixture
def pipeline(db):
    return {
        "open": PipelineStage.objects.create(name="Open", order=0),
        "won": PipelineStage.objects.create(name="Won", order=1, is_won=True),
        "lost": PipelineStage.objects.create(name="Lost", order=2, is_lost=True),
    }


@pytest.fixture
def data(rep, other_rep, pipeline, source):
    """rep: 3 leads this month (1 converted) + 1 old; deals: open 100, won 500 now, won 900 last
    month. other_rep: 1 lead this month, won 300 now, lost 50 now."""
    now = timezone.now()
    start, _ = period_bounds("this_month", ZoneInfo(TZ))
    this_month = start + (now - start) / 2
    last_month = start - timedelta(days=1)

    def lead(owner, created, status="new", src=None):
        obj = Lead.objects.create(name="L", owner=owner, status=status, source=src)
        Lead.objects.filter(pk=obj.pk).update(
            created_at=created, converted_at=created if status == "converted" else None
        )

    lead(rep, this_month, src=source)
    lead(rep, this_month, status="converted", src=source)
    lead(rep, this_month, status="qualified")
    lead(rep, start - timedelta(days=40))
    lead(other_rep, this_month)

    def deal(owner, stage, value, closed=None):
        Deal.objects.create(
            title="D", owner=owner, stage=pipeline[stage], value=value, closed_at=closed
        )

    deal(rep, "open", 100)
    deal(rep, "won", 500, this_month)
    deal(rep, "won", 900, last_month)
    deal(other_rep, "won", 300, this_month)
    deal(other_rep, "lost", 50, this_month)


def get_dashboard(client):
    r = client.get("/api/v1/reports/dashboard/", {"tz": TZ})
    assert r.status_code == 200
    return r.json()


def test_rep_dashboard_is_scoped_and_has_no_leaderboard(api, rep, data):
    d = get_dashboard(api(rep))
    assert d["kpis"] == {
        "new_leads_this_month": 3,
        "total_leads": 4,
        "converted_leads": 1,
        "conversion_rate": 0.25,
        "open_deal_value": "100.00",
        "open_deal_count": 1,
        "won_value_this_month": "500.00",
        "won_count_this_month": 1,
    }
    assert d["leaderboard"] is None
    by_status = {row["status"]: row["count"] for row in d["leads_by_status"]}
    assert by_status == {"new": 2, "contacted": 0, "qualified": 1, "lost": 0, "converted": 1}
    assert d["leads_by_source"] == [
        {"source": None, "name": "No source", "count": 2},
        {"source": LeadSource.objects.get().pk, "name": "Website", "count": 2},
    ]


def test_manager_dashboard_totals_and_leaderboard(api, manager, rep, other_rep, data):
    d = get_dashboard(api(manager))
    assert d["kpis"]["new_leads_this_month"] == 4
    assert d["kpis"]["won_value_this_month"] == "800.00"
    assert [(s["name"], s["count"], s["value"]) for s in d["deals_by_stage"]] == [
        ("Open", 1, "100.00"),
        ("Won", 3, "1700.00"),
        ("Lost", 1, "50.00"),
    ]
    board = d["leaderboard"]
    assert [r["user"] for r in board] == [rep.pk, other_rep.pk]  # 500 won beats 300
    assert board[0] | {"name": ""} == {
        "user": rep.pk,
        "name": "",
        "new_leads": 3,
        "converted_leads": 1,
        "won_count": 1,
        "won_value": "500.00",
        "lost_count": 0,
        "open_count": 1,
        "open_value": "100.00",
    }
    assert board[1]["lost_count"] == 1


def test_performance_periods_and_permissions(api, rep, manager, data):
    assert api(rep).get("/api/v1/reports/performance/").status_code == 403
    c = api(manager)
    assert c.get("/api/v1/reports/performance/", {"period": "decade"}).status_code == 400
    last = c.get("/api/v1/reports/performance/", {"period": "last_month", "tz": TZ}).json()
    top = last["reps"][0]
    assert (top["user"], top["won_value"], top["new_leads"]) == (rep.pk, "900.00", 0)
    months = last["won_by_month"]
    assert len(months) == 12
    assert months[-1]["value"] == "800.00" and months[-2]["value"] == "900.00"
    assert last["period"]["label"] == "Last month"


def test_period_bounds_follow_the_viewer_timezone():
    tz = ZoneInfo("Pacific/Kiritimati")  # UTC+14: often already "tomorrow"
    today = timezone.localtime(timezone.now(), tz).date()
    month = today.replace(day=1)
    expect = {
        "this_month": (month, add_months(month, 1)),
        "last_month": (add_months(month, -1), month),
        "this_quarter": (
            date(today.year, 3 * ((today.month - 1) // 3) + 1, 1),
            add_months(date(today.year, 3 * ((today.month - 1) // 3) + 1, 1), 3),
        ),
        "this_year": (date(today.year, 1, 1), date(today.year + 1, 1, 1)),
    }
    for period, (start, end) in expect.items():
        s, e = period_bounds(period, tz)
        assert (s.date(), e.date(), s.utcoffset()) == (start, end, timedelta(hours=14)), period
    assert add_months(date(2026, 11, 1), 3) == date(2027, 2, 1)
    assert add_months(date(2026, 1, 1), -1) == date(2025, 12, 1)


def test_dashboard_query_count_does_not_grow(
    api, manager, rep, pipeline, source, django_assert_max_num_queries
):
    for i in range(40):
        Lead.objects.create(name=f"L{i}", owner=rep, source=source)
        Deal.objects.create(
            title=f"D{i}", owner=rep, stage=pipeline["won"], value=i, closed_at=timezone.now()
        )
    with django_assert_max_num_queries(12):
        assert api(manager).get("/api/v1/reports/dashboard/").status_code == 200
