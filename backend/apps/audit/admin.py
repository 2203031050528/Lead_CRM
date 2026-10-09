from django.contrib import admin

from .models import AuditLog


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "actor", "action", "model", "object_id", "object_repr")
    list_filter = ("action", "model")
    search_fields = ("object_id", "object_repr")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
