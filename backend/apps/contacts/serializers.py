from rest_framework import serializers

from apps.core.permissions import ScopedPrimaryKeyRelatedField
from apps.core.serializers import OwnedSerializerMixin

from .models import Company, Contact


class CompanySerializer(OwnedSerializerMixin, serializers.ModelSerializer):
    contact_count = serializers.IntegerField(read_only=True, required=False)
    deal_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Company
        fields = [
            "id",
            "name",
            "website",
            "industry",
            "phone",
            "address",
            "owner",
            "owner_name",
            "contact_count",
            "deal_count",
            "created_at",
            "updated_at",
        ]


class ContactSerializer(OwnedSerializerMixin, serializers.ModelSerializer):
    company = ScopedPrimaryKeyRelatedField(
        queryset=Company.objects.all(), required=False, allow_null=True
    )
    company_name = serializers.CharField(source="company.name", read_only=True, default="")
    full_name = serializers.CharField(source="__str__", read_only=True)

    class Meta:
        model = Contact
        fields = [
            "id",
            "first_name",
            "last_name",
            "full_name",
            "email",
            "phone",
            "job_title",
            "company",
            "company_name",
            "owner",
            "owner_name",
            "created_at",
            "updated_at",
        ]
