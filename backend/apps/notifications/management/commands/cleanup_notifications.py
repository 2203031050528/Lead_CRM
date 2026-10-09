from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.models import Notification

BATCH = 5000


class Command(BaseCommand):
    help = "Delete read notifications older than N days (60). Run weekly from cron."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=60)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, days, dry_run, **options):
        cutoff = timezone.now() - timedelta(days=days)
        old = Notification.objects.filter(is_read=True, created_at__lt=cutoff)
        if dry_run:
            self.stdout.write(
                f"Would delete {old.count()} read notification(s) older than {days} days."
            )
            return
        deleted = 0
        while ids := list(old.values_list("pk", flat=True)[:BATCH]):  # small batches: short locks
            deleted += Notification.objects.filter(pk__in=ids).delete()[0]
        self.stdout.write(f"Deleted {deleted} read notification(s) older than {days} days.")
