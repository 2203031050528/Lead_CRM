from django.conf import settings
from django.db import models

from apps.activities.models import ONE_PARENT
from apps.core.models import TimeStampedModel


class Attachment(TimeStampedModel):
    s3_key = models.CharField(max_length=500, unique=True)
    filename = models.CharField(max_length=255)
    size = models.PositiveIntegerField()
    content_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="attachments"
    )
    lead = models.ForeignKey(
        "leads.Lead", null=True, blank=True, on_delete=models.CASCADE, related_name="attachments"
    )
    deal = models.ForeignKey(
        "deals.Deal", null=True, blank=True, on_delete=models.CASCADE, related_name="attachments"
    )
    contact = models.ForeignKey(
        "contacts.Contact",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="attachments",
    )

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.CheckConstraint(condition=ONE_PARENT, name="attachment_one_parent")]

    def __str__(self):
        return self.filename
