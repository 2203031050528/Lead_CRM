from django.contrib import admin

from apps.audit.utils import AuditedAdminMixin

from .models import Lead, LeadSource, Tag

admin.site.register(LeadSource)


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "color")


@admin.register(Lead)
class LeadAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("name", "email", "status", "source", "owner", "estimated_value", "created_at")
    list_filter = ("status", "source", "owner")
    search_fields = ("name", "email", "phone", "company_name")
    list_select_related = ("source", "owner")
    filter_horizontal = ("tags",)
    raw_id_fields = ("converted_contact",)
