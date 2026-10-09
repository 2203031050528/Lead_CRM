from django.contrib import admin

from .models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title", "assigned_to", "due_at", "is_done", "reminder_sent")
    list_filter = ("is_done", "reminder_sent")
    list_select_related = ("assigned_to",)
    raw_id_fields = ("lead", "deal")
