from django.contrib import admin

from .models import Attachment


@admin.register(Attachment)
class AttachmentAdmin(admin.ModelAdmin):
    list_display = ("filename", "size", "uploaded_by", "created_at")
    raw_id_fields = ("lead", "deal", "contact")
