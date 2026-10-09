from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.core.serializers import OwnedSerializerMixin
from apps.deals.models import PipelineStage

from .models import Lead, LeadSource, Tag


class LeadSourceSerializer(serializers.ModelSerializer):
    lead_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = LeadSource
        fields = ["id", "name", "lead_count", "created_at", "updated_at"]


class TagSerializer(serializers.ModelSerializer):
    color = serializers.RegexField(r"^#[0-9a-fA-F]{6}$", required=False)
    lead_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Tag
        fields = ["id", "name", "color", "lead_count", "created_at", "updated_at"]


class LeadSerializer(OwnedSerializerMixin, serializers.ModelSerializer):
    source_name = serializers.CharField(source="source.name", read_only=True, default="")
    tags = serializers.PrimaryKeyRelatedField(queryset=Tag.objects.all(), many=True, required=False)
    tag_details = TagSerializer(source="tags", many=True, read_only=True)

    class Meta:
        model = Lead
        fields = [
            "id",
            "name",
            "email",
            "phone",
            "company_name",
            "source",
            "source_name",
            "status",
            "estimated_value",
            "owner",
            "owner_name",
            "tags",
            "tag_details",
            "notes",
            "converted_contact",
            "converted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["converted_contact", "converted_at"]

    def validate_status(self, value):
        # "Converted" is only reachable through the convert action.
        current = self.instance.status if self.instance else None
        if value == Lead.Status.CONVERTED and current != Lead.Status.CONVERTED:
            raise serializers.ValidationError("Use the convert action to convert a lead.")
        return value


class BulkIdsSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), min_length=1, max_length=500)


class BulkAssignSerializer(BulkIdsSerializer):
    owner = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(is_active=True)
    )


class BulkStatusSerializer(BulkIdsSerializer):
    status = serializers.ChoiceField(
        choices=[c for c in Lead.Status.choices if c[0] != Lead.Status.CONVERTED]
    )


class ConvertLeadSerializer(serializers.Serializer):
    create_deal = serializers.BooleanField(default=True)
    deal_title = serializers.CharField(max_length=200, required=False, allow_blank=True)
    deal_value = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, min_value=Decimal(0)
    )
    stage = serializers.PrimaryKeyRelatedField(queryset=PipelineStage.objects.all(), required=False)
    expected_close_date = serializers.DateField(required=False, allow_null=True)


class ImportUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    # JSON list aligned with the CSV header: target field per column, "" to skip it.
    mapping = serializers.JSONField(binary=True, required=False)
    dry_run = serializers.BooleanField(default=True)
    skip_invalid = serializers.BooleanField(default=False)
