from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import TimeStampedModel


class Task(TimeStampedModel):
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True, db_index=True)
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="tasks"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_tasks"
    )
    lead = models.ForeignKey(
        "leads.Lead", null=True, blank=True, on_delete=models.CASCADE, related_name="tasks"
    )
    deal = models.ForeignKey(
        "deals.Deal", null=True, blank=True, on_delete=models.CASCADE, related_name="tasks"
    )
    is_done = models.BooleanField(default=False, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    reminder_sent = models.BooleanField(default=False)

    class Meta:
        ordering = ["is_done", "due_at"]
        indexes = [models.Index(fields=["assigned_to", "is_done", "due_at"])]
        constraints = [
            models.CheckConstraint(
                condition=~Q(lead__isnull=False, deal__isnull=False), name="task_at_most_one_parent"
            )
        ]

    def __str__(self):
        return self.title
