from django.conf import settings
from django.db import models


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        DELETE = "delete", "Delete"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    action = models.CharField(max_length=10, choices=Action.choices)
    model = models.CharField(max_length=50, db_index=True)
    object_id = models.CharField(max_length=40)
    object_repr = models.CharField(max_length=200, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    # Required by the brief: every model has created/updated timestamps.
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-timestamp"]
        indexes = [models.Index(fields=["model", "object_id"])]

    def __str__(self):
        return f"{self.action} {self.model}#{self.object_id}"
