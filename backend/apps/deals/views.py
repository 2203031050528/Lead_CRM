from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.activities.models import Activity
from apps.core.csv_export import csv_download
from apps.core.permissions import AdminWriteOrReadOnly
from apps.core.views import OwnedModelViewSet
from apps.notifications.models import notify

from .filters import DealFilter
from .models import Deal, PipelineStage
from .serializers import DealSerializer, PipelineStageSerializer, StageReorderSerializer


class PipelineStageViewSet(viewsets.ModelViewSet):
    queryset = PipelineStage.objects.annotate(deal_count=Count("deals")).order_by("order", "id")
    serializer_class = PipelineStageSerializer
    permission_classes = [AdminWriteOrReadOnly]
    pagination_class = None

    def perform_destroy(self, instance):
        if instance.deals.exists():
            raise ValidationError({"detail": "Move this stage's deals before deleting it."})
        instance.delete()

    @extend_schema(request=StageReorderSerializer, responses=PipelineStageSerializer(many=True))
    @action(detail=False, methods=["post"])
    @transaction.atomic
    def reorder(self, request):
        s = StageReorderSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        ids = s.validated_data["ids"]
        stages = {st.pk: st for st in PipelineStage.objects.all()}
        if sorted(ids) != sorted(stages):
            raise ValidationError({"ids": ["Provide every stage id exactly once."]})
        for i, pk in enumerate(ids):
            stages[pk].order = i
        PipelineStage.objects.bulk_update(stages.values(), ["order"])
        return Response(PipelineStageSerializer(self.get_queryset(), many=True).data)


class DealViewSet(OwnedModelViewSet):
    queryset = Deal.objects.select_related("owner", "stage", "contact", "company")
    serializer_class = DealSerializer
    filterset_class = DealFilter
    search_fields = ["title", "company__name", "contact__first_name", "contact__last_name"]
    ordering_fields = ["title", "value", "expected_close_date", "created_at", "updated_at"]

    def create_kwargs(self, serializer):
        stage = serializer.validated_data["stage"]
        return {
            **super().create_kwargs(serializer),
            "closed_at": timezone.now() if stage.is_won or stage.is_lost else None,
        }

    def perform_update(self, serializer):
        old_stage = serializer.instance.stage
        new_stage = serializer.validated_data.get("stage", old_stage)
        if new_stage != old_stage:
            closed = new_stage.is_won or new_stage.is_lost
            was_closed = old_stage.is_won or old_stage.is_lost
            if closed and not was_closed:
                serializer.validated_data["closed_at"] = timezone.now()
            elif not closed:
                serializer.validated_data["closed_at"] = None
        super().perform_update(serializer)
        if new_stage != old_stage:
            Activity.objects.create(
                type=Activity.Type.NOTE,
                subject=f"Stage changed: {old_stage.name} → {new_stage.name}",
                user=self.request.user,
                deal=serializer.instance,
            )

    def after_create(self, instance):
        self._notify_owner(instance)

    def after_update(self, instance, changes):
        if "owner_id" in changes:
            self._notify_owner(instance)

    def _notify_owner(self, deal):
        if deal.owner_id != self.request.user.pk:
            notify(deal.owner, f"Deal assigned to you: {deal.title}", f"/deals/detail?id={deal.pk}")

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def summary(self, request):
        """Per-stage count and total value for the Kanban column headers (honours filters)."""
        qs = self.filter_queryset(self.get_queryset())
        totals = {
            row["stage"]: row
            for row in qs.order_by().values("stage").annotate(count=Count("id"), total=Sum("value"))
        }
        data = [
            {
                "stage": st.pk,
                "name": st.name,
                "count": totals.get(st.pk, {}).get("count", 0),
                "total": str(totals.get(st.pk, {}).get("total") or 0),
            }
            for st in PipelineStage.objects.all()
        ]
        return Response(data)

    @extend_schema(responses={(200, "text/csv"): OpenApiTypes.STR})
    @action(detail=False, methods=["get"])
    def export(self, request):
        deals = self.filter_queryset(self.get_queryset()).iterator(chunk_size=500)
        return csv_download(
            "deals",
            [
                "id",
                "title",
                "value",
                "stage",
                "contact",
                "company",
                "owner",
                "expected_close_date",
                "closed_at",
                "created_at",
            ],
            (
                (
                    d.id,
                    d.title,
                    d.value,
                    d.stage.name,
                    str(d.contact) if d.contact else "",
                    d.company.name if d.company else "",
                    d.owner.username,
                    d.expected_close_date,
                    d.closed_at,
                    d.created_at,
                )
                for d in deals
            ),
        )
