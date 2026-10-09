from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.core.permissions import ScopedPrimaryKeyRelatedField
from apps.deals.models import Deal
from apps.leads.models import Lead

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    assigned_to = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(is_active=True), required=False
    )
    lead = ScopedPrimaryKeyRelatedField(
        queryset=Lead.objects.all(), required=False, allow_null=True
    )
    deal = ScopedPrimaryKeyRelatedField(
        queryset=Deal.objects.all(), required=False, allow_null=True
    )
    assigned_to_name = serializers.CharField(source="assigned_to.__str__", read_only=True)
    lead_name = serializers.CharField(source="lead.name", read_only=True, default="")
    deal_title = serializers.CharField(source="deal.title", read_only=True, default="")

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "due_at",
            "assigned_to",
            "assigned_to_name",
            "created_by",
            "lead",
            "lead_name",
            "deal",
            "deal_title",
            "is_done",
            "completed_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "completed_at"]

    def validate_assigned_to(self, value):
        user = self.context["request"].user
        if not user.is_manager_or_admin and value != user:
            raise serializers.ValidationError("Sales reps can only assign tasks to themselves.")
        return value

    def validate(self, attrs):
        lead = attrs.get("lead", getattr(self.instance, "lead", None))
        deal = attrs.get("deal", getattr(self.instance, "deal", None))
        if lead and deal:
            raise serializers.ValidationError("Link a task to a lead or a deal, not both.")
        return attrs
