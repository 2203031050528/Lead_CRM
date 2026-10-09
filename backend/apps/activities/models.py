from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.models import TimeStampedModel

# "Generic link" is implemented as three nullable FKs plus a check constraint that
# exactly one is set. Unlike GenericForeignKey this supports select_related and
# simple owner-based permission filtering.
ONE_PARENT = (
    Q(lead__isnull=False, deal__isnull=True, contact__isnull=True)
    | Q(lead__isnull=True, deal__isnull=False, contact__isnull=True)
    | Q(lead__isnull=True, deal__isnull=True, contact__isnull=False)
)


class Activity(TimeStampedModel):
    class Type(models.TextChoices):
        CALL = "call", "Call"
        MEETING = "meeting", "Meeting"
        EMAIL = "email", "Email"
        NOTE = "note", "Note"

    type = models.CharField(max_length=10, choices=Type.choices, default=Type.NOTE)
    subject = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    occurred_at = models.DateTimeField(default=timezone.now, db_index=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="activities"
    )
    lead = models.ForeignKey(
        "leads.Lead", null=True, blank=True, on_delete=models.CASCADE, related_name="activities"
    )
    deal = models.ForeignKey(
        "deals.Deal", null=True, blank=True, on_delete=models.CASCADE, related_name="activities"
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="activities",
    )

    class Meta:
        ordering = ["-occurred_at"]
        verbose_name_plural = "activities"
        constraints = [models.CheckConstraint(condition=ONE_PARENT, name="activity_one_parent")]

    def __str__(self):
        return f"{self.get_type_display()}: {self.subject}"
