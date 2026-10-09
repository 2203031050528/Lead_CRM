import logging
from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.models import Notification
from apps.tasks.models import Task

logger = logging.getLogger(__name__)


def due_phrase(due_at, now) -> str:
    minutes = round((due_at - now).total_seconds() / 60)
    if minutes > 1:
        return f"due in {minutes} minutes"
    if minutes >= -1:
        return "due now"
    return f"was due {-minutes} minutes ago"


def task_link(task: Task) -> str:
    if task.lead_id:
        return f"/leads/detail?id={task.lead_id}"
    if task.deal_id:
        return f"/deals/detail?id={task.deal_id}"
    return "/tasks"


class Command(BaseCommand):
    help = (
        "Remind assignees (in-app + email) about open tasks due within the next hour and set "
        "reminder_sent. Run every 15 minutes from cron."
    )

    def add_arguments(self, parser):
        parser.add_argument("--window", type=int, default=60, help="Minutes ahead to look (60).")
        parser.add_argument(
            "--grace",
            type=int,
            default=15,
            help="Also remind tasks that fell due this many minutes ago, so a task created "
            "between two runs is never skipped. Keep it equal to the cron interval (15).",
        )
        parser.add_argument(
            "--dry-run", action="store_true", help="List reminders without sending."
        )

    def handle(self, *args, window, grace, dry_run, **options):
        now = timezone.now()
        due = (
            Task.objects.filter(
                is_done=False,
                reminder_sent=False,
                due_at__gt=now - timedelta(minutes=grace),
                due_at__lte=now + timedelta(minutes=window),
            )
            .select_related("assigned_to", "lead", "deal")
            .order_by("due_at")
        )
        if dry_run:
            for task in due:
                when = due_phrase(task.due_at, now)
                self.stdout.write(f"would remind {task.assigned_to} about “{task.title}” ({when})")
            return

        # Claim each task with a conditional UPDATE so overlapping runs never remind twice.
        claimed = [
            t
            for t in due
            if Task.objects.filter(pk=t.pk, reminder_sent=False).update(reminder_sent=True)
        ]
        if not claimed:
            self.stdout.write("No tasks due within the window.")
            return

        Notification.objects.bulk_create(
            [
                Notification(
                    recipient=t.assigned_to,
                    message=f"Task {due_phrase(t.due_at, now)}: {t.title}"[:255],
                    link=task_link(t),
                )
                for t in claimed
            ]
        )

        by_user = defaultdict(list)
        for task in claimed:
            if task.assigned_to.is_active and task.assigned_to.email:
                by_user[task.assigned_to].append(task)
        messages = [self.email(user, tasks, now) for user, tasks in by_user.items()]
        sent = failed = 0
        if messages:
            try:
                sent = get_connection(fail_silently=False).send_messages(messages) or 0
            except Exception:  # SMTP down: in-app notifications are already delivered
                logger.exception("Sending %d reminder email(s) failed", len(messages))
                failed = len(messages)
        self.stdout.write(
            f"Reminded {len(claimed)} task(s): {len(claimed)} notification(s), "
            f"{sent} email(s) sent, {failed} failed."
        )
        if failed:
            self.stderr.write(f"{failed} reminder email(s) could not be sent; see the log above.")

    def email(self, user, tasks: list[Task], now) -> EmailMessage:
        base = settings.FRONTEND_URL.rstrip("/")
        if len(tasks) == 1:
            subject = f"Reminder: “{tasks[0].title}” is {due_phrase(tasks[0].due_at, now)}"
        else:
            subject = f"Reminder: {len(tasks)} tasks due within the hour"
        lines = [f"Hi {user.first_name or user.username},", "", "These tasks are due soon:", ""]
        for t in tasks:
            local = timezone.localtime(t.due_at)
            lines.append(f"• {t.title} — {due_phrase(t.due_at, now)} ({local:%H:%M %Z})")
            related = t.lead.name if t.lead_id else t.deal.title if t.deal_id else ""
            if related:
                lines.append(
                    f"  {'Lead' if t.lead_id else 'Deal'}: {related} — {base}{task_link(t)}"
                )
        lines += ["", f"All your tasks: {base}/tasks", "", "— Lead CRM"]
        return EmailMessage(subject[:200], "\n".join(lines), None, [user.email])
