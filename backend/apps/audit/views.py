import django_filters
from rest_framework import viewsets

from apps.core.permissions import IsAdminRole

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogFilter(django_filters.FilterSet):
    after = django_filters.DateFilter(field_name="timestamp", lookup_expr="date__gte")
    before = django_filters.DateFilter(field_name="timestamp", lookup_expr="date__lte")

    class Meta:
        model = AuditLog
        fields = ["actor", "action", "model", "object_id", "after", "before"]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related("actor")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminRole]
    filterset_class = AuditLogFilter
    search_fields = ["object_repr"]
    ordering_fields = ["timestamp"]
