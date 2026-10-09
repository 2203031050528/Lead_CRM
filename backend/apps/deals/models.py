from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class PipelineStage(TimeStampedModel):
    name = models.CharField(max_length=100)
    order = models.PositiveIntegerField(default=0, db_index=True)
    is_won = models.BooleanField(default=False)
    is_lost = models.BooleanField(default=False)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        return self.name


class Deal(TimeStampedModel):
    title = models.CharField(max_length=200)
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stage = models.ForeignKey(PipelineStage, on_delete=models.PROTECT, related_name="deals")
    contact = models.ForeignKey(
        "contacts.Contact", null=True, blank=True, on_delete=models.SET_NULL, related_name="deals"
    )
    company = models.ForeignKey(
        "contacts.Company", null=True, blank=True, on_delete=models.SET_NULL, related_name="deals"
    )
    lead = models.ForeignKey(
        "leads.Lead", null=True, blank=True, on_delete=models.SET_NULL, related_name="deals"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="deals"
    )
    expected_close_date = models.DateField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "stage"])]

    def __str__(self):
        return self.title
