from django.contrib import admin

from apps.audit.utils import AuditedAdminMixin

from .models import Deal, PipelineStage


@admin.register(PipelineStage)
class PipelineStageAdmin(admin.ModelAdmin):
    list_display = ("name", "order", "is_won", "is_lost")
    list_editable = ("order",)


@admin.register(Deal)
class DealAdmin(AuditedAdminMixin, admin.ModelAdmin):
    list_display = ("title", "value", "stage", "owner", "expected_close_date")
    list_filter = ("stage", "owner")
    search_fields = ("title",)
    list_select_related = ("stage", "owner")
    raw_id_fields = ("contact", "company", "lead")
