from datetime import datetime, time, timedelta

import django_filters
from django.db.models import Q
from django.utils import timezone

from apps.core.timezones import request_timezone

from .models import Task


class TaskFilter(django_filters.FilterSet):
    bucket = django_filters.ChoiceFilter(
        choices=[("overdue", "Overdue"), ("today", "Today"), ("upcoming", "Upcoming")],
        method="filter_bucket",
    )
    mine = django_filters.BooleanFilter(method="filter_mine")

    class Meta:
        model = Task
        fields = ["is_done", "assigned_to", "lead", "deal"]

    def filter_bucket(self, qs, name, value):
        tz = request_timezone(self.request)
        now = timezone.now()
        today = timezone.localtime(now, tz).date()
        tomorrow = datetime.combine(today + timedelta(days=1), time.min, tzinfo=tz)
        qs = qs.filter(is_done=False)
        if value == "overdue":
            return qs.filter(due_at__lt=now)
        if value == "today":
            return qs.filter(due_at__gte=now, due_at__lt=tomorrow)
        return qs.filter(Q(due_at__gte=tomorrow) | Q(due_at__isnull=True))

    def filter_mine(self, qs, name, value):
        return qs.filter(assigned_to=self.request.user) if value else qs
