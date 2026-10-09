from django.contrib import admin

from apps.audit.utils import AuditedAdminMixin

from .models import Company, Contact


@admin.register(Company)
class CompanyAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("name", "industry", "owner", "created_at")
    search_fields = ("name", "website")
    list_select_related = ("owner",)


@admin.register(Contact)
class ContactAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("first_name", "last_name", "email", "company", "owner")
    search_fields = ("first_name", "last_name", "email", "phone")
    list_select_related = ("company", "owner")
    raw_id_fields = ("company",)
