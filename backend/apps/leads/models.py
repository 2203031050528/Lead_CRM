from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class LeadSource(TimeStampedModel):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Tag(TimeStampedModel):
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=7, default="#6b7280")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Lead(TimeStampedModel):
    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        QUALIFIED = "qualified", "Qualified"
        LOST = "lost", "Lost"
        CONVERTED = "converted", "Converted"

    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    company_name = models.CharField(max_length=200, blank=True)
    source = models.ForeignKey(
        LeadSource, null=True, blank=True, on_delete=models.SET_NULL, related_name="leads"
    )
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.NEW, db_index=True
    )
    estimated_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="leads"
    )
    tags = models.ManyToManyField(Tag, blank=True, related_name="leads")
    notes = models.TextField(blank=True)
    converted_contact = models.ForeignKey(
        "contacts.Contact", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    converted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "status"])]

    def __str__(self):
        return self.name
