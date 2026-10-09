import django_filters

from .models import Deal


class DealFilter(django_filters.FilterSet):
    is_open = django_filters.BooleanFilter(method="filter_open")
    expected_close_after = django_filters.DateFilter(
        field_name="expected_close_date", lookup_expr="gte"
    )
    expected_close_before = django_filters.DateFilter(
        field_name="expected_close_date", lookup_expr="lte"
    )

    class Meta:
        model = Deal
        fields = ["stage", "owner", "company", "contact", "lead"]

    def filter_open(self, qs, name, value):
        open_q = {"stage__is_won": False, "stage__is_lost": False}
        return qs.filter(**open_q) if value else qs.exclude(**open_q)
