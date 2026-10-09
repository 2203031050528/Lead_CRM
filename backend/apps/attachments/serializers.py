from django.conf import settings
from rest_framework import serializers

from apps.contacts.models import Contact
from apps.core.permissions import ScopedPrimaryKeyRelatedField
from apps.deals.models import Deal
from apps.leads.models import Lead

from .models import Attachment

PARENTS = ("lead", "deal", "contact")


class AttachmentSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source="uploaded_by.__str__", read_only=True)

    class Meta:
        model = Attachment
        fields = [
            "id",
            "filename",
            "size",
            "content_type",
            "uploaded_by",
            "uploaded_by_name",
            "lead",
            "deal",
            "contact",
            "created_at",
        ]
        read_only_fields = fields


class UploadRequestSerializer(serializers.Serializer):
    filename = serializers.CharField(max_length=255)
    size = serializers.IntegerField(
        min_value=1,
        max_value=settings.ATTACHMENT_MAX_BYTES,
        error_messages={"max_value": "Files can be at most 10 MB."},
    )
    content_type = serializers.CharField(max_length=100, required=False, allow_blank=True)
    lead = ScopedPrimaryKeyRelatedField(
        queryset=Lead.objects.all(), required=False, allow_null=True
    )
    deal = ScopedPrimaryKeyRelatedField(
        queryset=Deal.objects.all(), required=False, allow_null=True
    )
    contact = ScopedPrimaryKeyRelatedField(
        queryset=Contact.objects.all(), required=False, allow_null=True
    )

    def validate(self, attrs):
        if sum(1 for p in PARENTS if attrs.get(p)) != 1:
            raise serializers.ValidationError(
                "Attach the file to exactly one lead, deal or contact."
            )
        return attrs


class ConfirmUploadSerializer(serializers.Serializer):
    token = serializers.CharField()
