from django.db.models import Count
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import action

from apps.core.csv_export import csv_download
from apps.core.views import OwnedModelViewSet

from .filters import CompanyFilter, ContactFilter
from .models import Company, Contact
from .serializers import CompanySerializer, ContactSerializer


class CompanyViewSet(OwnedModelViewSet):
    queryset = (
        Company.objects.select_related("owner")
        .annotate(
            contact_count=Count("contacts", distinct=True), deal_count=Count("deals", distinct=True)
        )
        .order_by("name")
    )
    serializer_class = CompanySerializer
    filterset_class = CompanyFilter
    search_fields = ["name", "website", "industry", "phone"]
    ordering_fields = ["name", "industry", "created_at", "updated_at"]


class ContactViewSet(OwnedModelViewSet):
    queryset = Contact.objects.select_related("owner", "company")
    serializer_class = ContactSerializer
    filterset_class = ContactFilter
    search_fields = ["first_name", "last_name", "email", "phone", "company__name"]
    ordering_fields = ["first_name", "last_name", "email", "created_at", "updated_at"]

    @extend_schema(responses={(200, "text/csv"): OpenApiTypes.STR})
    @action(detail=False, methods=["get"])
    def export(self, request):
        contacts = self.filter_queryset(self.get_queryset()).iterator(chunk_size=500)
        return csv_download(
            "contacts",
            [
                "id",
                "first_name",
                "last_name",
                "email",
                "phone",
                "job_title",
                "company",
                "owner",
                "created_at",
            ],
            (
                (
                    c.id,
                    c.first_name,
                    c.last_name,
                    c.email,
                    c.phone,
                    c.job_title,
                    c.company.name if c.company else "",
                    c.owner.username,
                    c.created_at,
                )
                for c in contacts
            ),
        )
