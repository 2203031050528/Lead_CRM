import django_filters

from .models import Lead


class LeadFilter(django_filters.FilterSet):
    status = django_filters.MultipleChoiceFilter(choices=Lead.Status.choices)
    tag = django_filters.NumberFilter(field_name="tags", distinct=True)
    created_after = django_filters.DateFilter(field_name="created_at", lookup_expr="date__gte")
    created_before = django_filters.DateFilter(field_name="created_at", lookup_expr="date__lte")

    class Meta:
        model = Lead
        fields = ["status", "source", "owner", "tag", "created_after", "created_before"]
