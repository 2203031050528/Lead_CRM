from rest_framework import serializers

from apps.contacts.models import Company, Contact
from apps.core.permissions import ScopedPrimaryKeyRelatedField
from apps.core.serializers import OwnedSerializerMixin
from apps.leads.models import Lead

from .models import Deal, PipelineStage


class PipelineStageSerializer(serializers.ModelSerializer):
    deal_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = PipelineStage
        fields = [
            "id",
            "name",
            "order",
            "is_won",
            "is_lost",
            "deal_count",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        is_won = attrs.get("is_won", getattr(self.instance, "is_won", False))
        is_lost = attrs.get("is_lost", getattr(self.instance, "is_lost", False))
        if is_won and is_lost:
            raise serializers.ValidationError("A stage cannot be both won and lost.")
        return attrs


class StageReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.IntegerField(), min_length=1)


class DealSerializer(OwnedSerializerMixin, serializers.ModelSerializer):
    contact = ScopedPrimaryKeyRelatedField(
        queryset=Contact.objects.all(), required=False, allow_null=True
    )
    company = ScopedPrimaryKeyRelatedField(
        queryset=Company.objects.all(), required=False, allow_null=True
    )
    lead = ScopedPrimaryKeyRelatedField(
        queryset=Lead.objects.all(), required=False, allow_null=True
    )
    stage_name = serializers.CharField(source="stage.name", read_only=True)
    contact_name = serializers.CharField(source="contact.__str__", read_only=True, default="")
    company_name = serializers.CharField(source="company.name", read_only=True, default="")

    class Meta:
        model = Deal
        fields = [
            "id",
            "title",
            "value",
            "stage",
            "stage_name",
            "contact",
            "contact_name",
            "company",
            "company_name",
            "lead",
            "owner",
            "owner_name",
            "expected_close_date",
            "closed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["closed_at"]
