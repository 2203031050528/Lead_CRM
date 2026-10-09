from rest_framework import serializers

from apps.contacts.models import Contact
from apps.core.permissions import ScopedPrimaryKeyRelatedField
from apps.deals.models import Deal
from apps.leads.models import Lead

from .models import Activity

PARENTS = ("lead", "deal", "contact")


class ActivitySerializer(serializers.ModelSerializer):
    lead = ScopedPrimaryKeyRelatedField(
        queryset=Lead.objects.all(), required=False, allow_null=True
    )
    deal = ScopedPrimaryKeyRelatedField(
        queryset=Deal.objects.all(), required=False, allow_null=True
    )
    contact = ScopedPrimaryKeyRelatedField(
        queryset=Contact.objects.all(), required=False, allow_null=True
    )
    user_name = serializers.CharField(source="user.__str__", read_only=True)

    class Meta:
        model = Activity
        fields = [
            "id",
            "type",
            "subject",
            "body",
            "occurred_at",
            "user",
            "user_name",
            "lead",
            "deal",
            "contact",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["user"]

    def validate(self, attrs):
        if self.instance is not None:
            if any(p in attrs for p in PARENTS):
                raise serializers.ValidationError("An activity cannot be moved to another record.")
            return attrs
        if sum(1 for p in PARENTS if attrs.get(p)) != 1:
            raise serializers.ValidationError(
                "Link the activity to exactly one lead, deal or contact."
            )
        return attrs
