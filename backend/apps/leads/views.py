from dataclasses import asdict

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response

from apps.audit.models import AuditLog
from apps.audit.utils import log
from apps.core.csv_export import csv_download
from apps.core.permissions import AdminWriteOrReadOnly, IsManagerOrAdmin
from apps.core.views import OwnedModelViewSet
from apps.notifications.models import notify

from .filters import LeadFilter
from .importer import (
    FIELDS,
    MAX_ROWS,
    CsvImportError,
    parse_csv,
    run_import,
    suggest_mapping,
    validate_mapping,
)
from .models import Lead, LeadSource, Tag
from .serializers import (
    BulkAssignSerializer,
    BulkStatusSerializer,
    ConvertLeadSerializer,
    ImportUploadSerializer,
    LeadSerializer,
    LeadSourceSerializer,
    TagSerializer,
)
from .services import ConversionError, convert_lead


class LeadSourceViewSet(viewsets.ModelViewSet):
    queryset = LeadSource.objects.annotate(lead_count=Count("leads")).order_by("name")
    serializer_class = LeadSourceSerializer
    permission_classes = [AdminWriteOrReadOnly]
    pagination_class = None
    search_fields = ["name"]


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.annotate(lead_count=Count("leads")).order_by("name")
    serializer_class = TagSerializer
    permission_classes = [AdminWriteOrReadOnly]
    pagination_class = None
    search_fields = ["name"]


def notify_lead_owner(lead: Lead, actor) -> None:
    if lead.owner_id != actor.pk:
        notify(lead.owner, f"Lead assigned to you: {lead.name}", f"/leads/detail?id={lead.pk}")


class LeadViewSet(OwnedModelViewSet):
    queryset = Lead.objects.select_related("owner", "source").prefetch_related("tags")
    serializer_class = LeadSerializer
    filterset_class = LeadFilter
    search_fields = ["name", "email", "phone", "company_name"]
    ordering_fields = ["name", "status", "estimated_value", "created_at", "updated_at"]

    def after_create(self, instance):
        notify_lead_owner(instance, self.request.user)

    def after_update(self, instance, changes):
        if "owner_id" in changes:
            notify_lead_owner(instance, self.request.user)

    def _bulk_targets(self, ids):
        leads = list(self.get_queryset().filter(pk__in=ids))
        missing = set(ids) - {lead.pk for lead in leads}
        if missing:
            raise ValidationError({"ids": [f"Not found or not permitted: {sorted(missing)}"]})
        return leads

    @extend_schema(request=BulkAssignSerializer, responses={200: dict})
    @action(detail=False, methods=["post"], permission_classes=[IsManagerOrAdmin])
    @transaction.atomic
    def bulk_assign(self, request):
        s = BulkAssignSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        owner = s.validated_data["owner"]
        leads = [
            lead
            for lead in self._bulk_targets(s.validated_data["ids"])
            if lead.owner_id != owner.pk
        ]
        for lead in leads:
            log(request.user, AuditLog.Action.UPDATE, lead, {"owner_id": [lead.owner_id, owner.pk]})
        Lead.objects.filter(pk__in=[lead.pk for lead in leads]).update(
            owner=owner, updated_at=timezone.now()
        )
        if leads and owner != request.user:
            notify(owner, f"{len(leads)} lead(s) assigned to you", "/leads")
        return Response({"updated": len(leads)})

    @extend_schema(request=BulkStatusSerializer, responses={200: dict})
    @action(detail=False, methods=["post"])
    @transaction.atomic
    def bulk_status(self, request):
        s = BulkStatusSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        new = s.validated_data["status"]
        leads = self._bulk_targets(s.validated_data["ids"])
        if any(lead.status == Lead.Status.CONVERTED for lead in leads):
            raise ValidationError({"ids": ["Converted leads cannot change status."]})
        leads = [lead for lead in leads if lead.status != new]
        for lead in leads:
            log(request.user, AuditLog.Action.UPDATE, lead, {"status": [lead.status, new]})
        Lead.objects.filter(pk__in=[lead.pk for lead in leads]).update(
            status=new, updated_at=timezone.now()
        )
        return Response({"updated": len(leads)})

    @extend_schema(request=ConvertLeadSerializer, responses={201: dict})
    @action(detail=True, methods=["post"])
    def convert(self, request, pk=None):
        lead = self.get_object()
        s = ConvertLeadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            result = convert_lead(lead, request.user, **s.validated_data)
        except ConversionError as e:
            raise ValidationError({"detail": str(e)}) from e
        return Response(result, status=status.HTTP_201_CREATED)

    @extend_schema(responses={(200, "text/csv"): OpenApiTypes.STR})
    @action(detail=False, methods=["get"])
    def export(self, request):
        """The current list (same filters, search and ordering) as CSV."""
        leads = self.filter_queryset(self.get_queryset()).iterator(chunk_size=500)
        return csv_download(
            "leads",
            [
                "id",
                "name",
                "email",
                "phone",
                "company",
                "source",
                "status",
                "estimated_value",
                "owner",
                "tags",
                "notes",
                "created_at",
                "converted_at",
            ],
            (
                (
                    lead.id,
                    lead.name,
                    lead.email,
                    lead.phone,
                    lead.company_name,
                    lead.source.name if lead.source else "",
                    lead.get_status_display(),
                    lead.estimated_value,
                    lead.owner.username,
                    "; ".join(t.name for t in lead.tags.all()),
                    lead.notes,
                    lead.created_at,
                    lead.converted_at,
                )
                for lead in leads
            ),
        )

    def _read_upload(self, request):
        upload = ImportUploadSerializer(data=request.data)
        upload.is_valid(raise_exception=True)
        try:
            return upload.validated_data, parse_csv(upload.validated_data["file"])
        except CsvImportError as e:
            raise ValidationError({"file": [str(e)]}) from e

    @extend_schema(request={"multipart/form-data": ImportUploadSerializer}, responses={200: dict})
    @action(
        detail=False, methods=["post"], url_path="import/preview", parser_classes=[MultiPartParser]
    )
    def import_preview(self, request):
        """Headers, a few sample rows and a suggested column → field mapping."""
        _, parsed = self._read_upload(request)
        return Response(
            {
                "headers": parsed.headers,
                "rows": len(parsed.rows),
                "sample": [cells for _, cells in parsed.rows[:5]],
                "mapping": suggest_mapping(parsed.headers),
                "fields": [{"value": k, "label": v} for k, v in FIELDS.items()],
                "max_rows": MAX_ROWS,
            }
        )

    @extend_schema(request={"multipart/form-data": ImportUploadSerializer}, responses={200: dict})
    @action(detail=False, methods=["post"], url_path="import", parser_classes=[MultiPartParser])
    def import_csv(self, request):
        """Validate every row (dry_run) or import them. Nothing is saved while rows have errors,
        unless skip_invalid is set."""
        options, parsed = self._read_upload(request)
        try:
            mapping = validate_mapping(options.get("mapping"), parsed.headers)
        except CsvImportError as e:
            raise ValidationError({"mapping": [str(e)]}) from e
        dry_run = options["dry_run"]
        result = run_import(
            parsed,
            mapping,
            request.user,
            commit=not dry_run,
            skip_invalid=options["skip_invalid"],
        )
        body = {**asdict(result), "dry_run": dry_run}
        if not dry_run and result.invalid and not options["skip_invalid"]:
            detail = (
                f"{result.invalid} row(s) have errors. Fix them, or choose to skip invalid rows."
            )
            return Response(
                {"detail": detail, "errors": {}, **body}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(
            body, status=status.HTTP_201_CREATED if result.created else status.HTTP_200_OK
        )
