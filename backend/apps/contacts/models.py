from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel


class Company(TimeStampedModel):
    name = models.CharField(max_length=200)
    website = models.URLField(blank=True)
    industry = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="companies"
    )

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "companies"
        indexes = [models.Index(fields=["name"])]

    def __str__(self):
        return self.name


class Contact(TimeStampedModel):
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    job_title = models.CharField(max_length=100, blank=True)
    company = models.ForeignKey(
        Company, null=True, blank=True, on_delete=models.SET_NULL, related_name="contacts"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="contacts"
    )

    class Meta:
        ordering = ["first_name", "last_name"]
        indexes = [models.Index(fields=["email"])]

    def __str__(self):
        return f"{self.first_name} {self.last_name}".strip()
