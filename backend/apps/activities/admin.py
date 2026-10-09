from django.contrib import admin

from .models import Activity


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("subject", "type", "user", "occurred_at")
    list_filter = ("type",)
    list_select_related = ("user",)
    raw_id_fields = ("lead", "deal", "contact")
