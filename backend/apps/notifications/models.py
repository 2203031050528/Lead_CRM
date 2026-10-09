from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Notification(TimeStampedModel):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    message = models.CharField(max_length=255)
    link = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["recipient", "is_read"])]

    def __str__(self):
        return self.message


def notify(recipient, message: str, link: str = "") -> Notification:
    return Notification.objects.create(recipient=recipient, message=message, link=link)
