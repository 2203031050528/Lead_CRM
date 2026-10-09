"""Dashboard and report aggregates. Every number comes from a grouped query (no per-row loops)."""

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.utils import timezone

from apps.accounts.models import User
from apps.core.permissions import is_privileged, scope
from apps.deals.models import Deal, PipelineStage
from apps.leads.models import Lead

PERIODS = {
    "this_month": "This month",
    "last_month": "Last month",
    "this_quarter": "This quarter",
    "this_year": "This year",
}
OPEN = Q(stage__is_won=False, stage__is_lost=False)


def money(value) -> str:
    return f"{(value or Decimal(0)):.2f}"


def add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    return date(d.year + m // 12, m % 12 + 1, 1)


def period_bounds(period: str, tz) -> tuple[datetime, datetime]:
    """[start, end) of a named period in the viewer's timezone."""
    today = timezone.localtime(timezone.now(), tz).date()
    month = today.replace(day=1)
    if period == "last_month":
        start, end = add_months(month, -1), month
    elif period == "this_quarter":
        start = date(today.year, 3 * ((today.month - 1) // 3) + 1, 1)
        end = add_months(start, 3)
    elif period == "this_year":
        start, end = date(today.year, 1, 1), date(today.year + 1, 1, 1)
    else:
        start, end = month, add_months(month, 1)
    return datetime.combine(start, time.min, tzinfo=tz), datetime.combine(end, time.min, tzinfo=tz)


def _between(field: str, start: datetime, end: datetime) -> Q:
    return Q(**{f"{field}__gte": start, f"{field}__lt": end})


def dashboard(user, tz) -> dict:
    leads = scope(Lead.objects.all(), user)
    deals = scope(Deal.objects.all(), user)
    start, end = period_bounds("this_month", tz)

    lead_totals = leads.aggregate(
        total=Count("id"),
        converted=Count("id", filter=Q(status=Lead.Status.CONVERTED)),
        new_this_month=Count("id", filter=_between("created_at", start, end)),
    )
    won_this_month = Q(stage__is_won=True) & _between("closed_at", start, end)
    deal_totals = deals.aggregate(
        open_value=Sum("value", filter=OPEN),
        open_count=Count("id", filter=OPEN),
        won_value=Sum("value", filter=won_this_month),
        won_count=Count("id", filter=won_this_month),
    )

    by_status = dict(leads.order_by().values_list("status").annotate(n=Count("id")))
    by_source = leads.order_by().values("source", "source__name").annotate(count=Count("id"))
    by_stage = {
        row["stage"]: row
        for row in deals.order_by().values("stage").annotate(count=Count("id"), value=Sum("value"))
    }
    total = lead_totals["total"]
    return {
        "kpis": {
            "new_leads_this_month": lead_totals["new_this_month"],
            "total_leads": total,
            "converted_leads": lead_totals["converted"],
            "conversion_rate": round(lead_totals["converted"] / total, 4) if total else 0,
            "open_deal_value": money(deal_totals["open_value"]),
            "open_deal_count": deal_totals["open_count"],
            "won_value_this_month": money(deal_totals["won_value"]),
            "won_count_this_month": deal_totals["won_count"],
        },
        "leads_by_status": [
            {"status": value, "label": label, "count": by_status.get(value, 0)}
            for value, label in Lead.Status.choices
        ],
        "leads_by_source": sorted(
            (
                {
                    "source": r["source"],
                    "name": r["source__name"] or "No source",
                    "count": r["count"],
                }
                for r in by_source
            ),
            key=lambda r: (-r["count"], r["name"]),
        ),
        "deals_by_stage": [
            {
                "stage": s.pk,
                "name": s.name,
                "is_won": s.is_won,
                "is_lost": s.is_lost,
                "count": by_stage.get(s.pk, {}).get("count", 0),
                "value": money(by_stage.get(s.pk, {}).get("value")),
            }
            for s in PipelineStage.objects.all()
        ],
        "leaderboard": rep_performance(tz, "this_month")["reps"][:5]
        if is_privileged(user)
        else None,
    }


def rep_performance(tz, period: str) -> dict:
    """Per-rep results for a period, plus won value per month for the last 12 months."""
    start, end = period_bounds(period, tz)
    reps = list(User.objects.filter(role=User.Role.REP, is_active=True).order_by("first_name"))
    ids = [u.pk for u in reps]

    lead_rows = {
        r["owner"]: r
        for r in Lead.objects.filter(owner__in=ids)
        .order_by()
        .values("owner")
        .annotate(
            new_leads=Count("id", filter=_between("created_at", start, end)),
            converted=Count("id", filter=_between("converted_at", start, end)),
        )
    }
    won = Q(stage__is_won=True) & _between("closed_at", start, end)
    lost = Q(stage__is_lost=True) & _between("closed_at", start, end)
    deal_rows = {
        r["owner"]: r
        for r in Deal.objects.filter(owner__in=ids)
        .order_by()
        .values("owner")
        .annotate(
            won_count=Count("id", filter=won),
            won_value=Sum("value", filter=won),
            lost_count=Count("id", filter=lost),
            open_count=Count("id", filter=OPEN),
            open_value=Sum("value", filter=OPEN),
        )
    }
    rows = []
    for u in reps:
        lr, dr = lead_rows.get(u.pk, {}), deal_rows.get(u.pk, {})
        rows.append(
            {
                "user": u.pk,
                "name": str(u),
                "new_leads": lr.get("new_leads", 0),
                "converted_leads": lr.get("converted", 0),
                "won_count": dr.get("won_count", 0),
                "won_value": money(dr.get("won_value")),
                "lost_count": dr.get("lost_count", 0),
                "open_count": dr.get("open_count", 0),
                "open_value": money(dr.get("open_value")),
            }
        )
    rows.sort(key=lambda r: (-Decimal(r["won_value"]), -r["won_count"], r["name"]))

    first_month = add_months(timezone.localtime(timezone.now(), tz).date().replace(day=1), -11)
    monthly = {
        timezone.localtime(r["month"], tz).date(): r
        for r in Deal.objects.filter(
            stage__is_won=True,
            closed_at__gte=datetime.combine(first_month, time.min, tzinfo=tz),
        )
        .annotate(month=TruncMonth("closed_at", tzinfo=tz))
        .order_by()
        .values("month")
        .annotate(value=Sum("value"), count=Count("id"))
    }
    months = [add_months(first_month, i) for i in range(12)]
    return {
        "period": {
            "key": period,
            "label": PERIODS[period],
            "start": start.isoformat(),
            "end": (end - timedelta(microseconds=1)).isoformat(),
        },
        "reps": rows,
        "won_by_month": [
            {
                "month": m.strftime("%Y-%m"),
                "value": money(monthly.get(m, {}).get("value")),
                "count": monthly.get(m, {}).get("count", 0),
            }
            for m in months
        ],
    }
