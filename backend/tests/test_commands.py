import gzip
import os
import re
import shutil
import subprocess
from datetime import UTC, datetime, timedelta
from io import StringIO
from unittest import mock

import boto3
import pytest
from botocore.stub import ANY, Stubber
from django.core import mail
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.utils import timezone

from apps.core.management.commands import backup_db as backup_module
from apps.leads.models import Lead
from apps.notifications.models import Notification
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db


def run(*args):
    out, err = StringIO(), StringIO()
    call_command(*args, stdout=out, stderr=err)
    return out.getvalue(), err.getvalue()


def task(user, minutes, title, **kw):
    return Task.objects.create(
        title=title,
        due_at=timezone.now() + timedelta(minutes=minutes),
        assigned_to=user,
        created_by=user,
        **kw,
    )


# --- send_task_reminders -------------------------------------------------------------------


def test_reminders_window_digest_and_idempotency(rep, other_rep, settings):
    settings.FRONTEND_URL = "https://crm.example.com/"
    lead = Lead.objects.create(name="Acme", owner=rep)
    task(rep, 30, "Call Acme", lead=lead)
    task(rep, -10, "Send quote")  # fell due since the last run: inside the grace period
    task(rep, 120, "Later")  # outside the window
    task(rep, -60 * 24, "Long overdue")  # already shown as overdue; no reminder
    task(rep, 20, "Done already", is_done=True)
    task(rep, 20, "Reminded already", reminder_sent=True)
    Task.objects.create(title="No due date", assigned_to=rep, created_by=rep)
    other_rep.email = ""
    other_rep.save()
    task(other_rep, 40, "For rep2")  # no email address: in-app only

    out, _ = run("send_task_reminders")
    assert "Reminded 3 task(s): 3 notification(s), 1 email(s) sent, 0 failed." in out
    assert len(mail.outbox) == 1
    msg = mail.outbox[0]
    assert msg.to == ["rep@example.com"]
    assert msg.subject == "Reminder: 2 tasks due within the hour"
    assert "• Call Acme — due in 30 minutes" in msg.body
    assert "• Send quote — was due 10 minutes ago" in msg.body
    assert f"Lead: Acme — https://crm.example.com/leads/detail?id={lead.pk}" in msg.body
    assert "All your tasks: https://crm.example.com/tasks" in msg.body
    assert dict(Notification.objects.values_list("message", "link")) == {
        "Task due in 30 minutes: Call Acme": f"/leads/detail?id={lead.pk}",
        "Task was due 10 minutes ago: Send quote": "/tasks",
        "Task due in 40 minutes: For rep2": "/tasks",
    }
    assert Task.objects.filter(reminder_sent=True).count() == 4

    out, _ = run("send_task_reminders")
    assert "No tasks due" in out and len(mail.outbox) == 1


def test_single_task_subject_and_dry_run(rep):
    task(rep, 45, "Prepare demo")
    out, _ = run("send_task_reminders", "--dry-run")
    assert "would remind" in out and "Prepare demo" in out
    assert not Notification.objects.exists() and not mail.outbox
    run("send_task_reminders")
    assert mail.outbox[0].subject == "Reminder: “Prepare demo” is due in 45 minutes"


def test_smtp_failure_still_notifies_in_app(rep):
    task(rep, 30, "Call back")
    with mock.patch("apps.tasks.management.commands.send_task_reminders.get_connection") as conn:
        conn.return_value.send_messages.side_effect = OSError("SMTP down")
        out, err = run("send_task_reminders")
    assert "0 email(s) sent, 1 failed" in out and "could not be sent" in err
    assert Notification.objects.count() == 1
    assert Task.objects.get().reminder_sent is True  # no retry storm next run


# --- cleanup_notifications -----------------------------------------------------------------


def test_cleanup_deletes_only_old_read_notifications(rep):
    old_read = Notification.objects.create(recipient=rep, message="old read", is_read=True)
    old_unread = Notification.objects.create(recipient=rep, message="old unread")
    Notification.objects.create(recipient=rep, message="recent read", is_read=True)
    Notification.objects.filter(pk__in=[old_read.pk, old_unread.pk]).update(
        created_at=timezone.now() - timedelta(days=61)
    )
    assert "Would delete 1" in run("cleanup_notifications", "--dry-run")[0]
    assert Notification.objects.count() == 3
    assert "Deleted 1" in run("cleanup_notifications")[0]
    assert set(Notification.objects.values_list("message", flat=True)) == {
        "old unread",
        "recent read",
    }


# --- backup_db -----------------------------------------------------------------------------


@pytest.fixture
def fake_pg_dump(tmp_path):
    """A stand-in pg_dump that prints its arguments and whether a password arrived via env."""
    script = tmp_path / "pg_dump"
    script.write_text(
        "#!/bin/sh\n"
        'echo "-- fake dump"\n'
        'echo "args: $*"\n'
        'echo "password-in-env: ${PGPASSWORD:+yes}"\n'
    )
    script.chmod(0o755)
    return str(script)


def test_backup_to_local_dir_streams_gzip_and_prunes(fake_pg_dump, tmp_path):
    db = connection.settings_dict["NAME"]
    out_dir = tmp_path / "backups"
    out_dir.mkdir()
    for day in (1, 2, 3):
        (out_dir / f"{db}-202601{day:02d}-000000.sql.gz").write_bytes(b"old")
    (out_dir / "keep-me.txt").write_text("not a backup")

    out, _ = run("backup_db", "--local-dir", str(out_dir), "--keep", "2", "--pg-dump", fake_pg_dump)
    assert "removed 2 old backup(s), keeping 2" in out
    backups = sorted(p.name for p in out_dir.iterdir() if p.name.startswith(f"{db}-"))
    assert len(backups) == 2 and backups[0] == f"{db}-20260103-000000.sql.gz"  # newest old one kept
    assert (out_dir / "keep-me.txt").exists()  # files not named like backups are never touched
    new = out_dir / backups[1]
    text = gzip.decompress(new.read_bytes()).decode()
    assert "-- fake dump" in text and "--no-owner" in text and f"--dbname {db}" in text
    assert "password-in-env: yes" in text or not connection.settings_dict.get("PASSWORD")
    # The password travels in PGPASSWORD, never in pg_dump's arguments (visible in `ps`).
    args = next(line for line in text.splitlines() if line.startswith("args: "))
    assert "--password" not in args and "password=" not in args.lower() and "://" not in args


def test_backup_uploads_to_s3_and_keeps_newest(fake_pg_dump, settings, monkeypatch):
    settings.AWS_BACKUP_BUCKET_NAME = "crm-backups"
    settings.BACKUP_PREFIX = "backups"

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            return datetime(2026, 2, 1, 3, 0, 0, tzinfo=tz)

    monkeypatch.setattr(backup_module, "datetime", FixedDatetime)
    db = connection.settings_dict["NAME"]
    prefix = f"backups/{db}/"
    new_key = f"{prefix}{db}-20260201-030000.sql.gz"
    old_keys = [f"{prefix}{db}-202601{d:02d}-000000.sql.gz" for d in range(1, 16)]

    # A real client wrapped in botocore's Stubber validates every call against the S3 API model.
    client = boto3.client(
        "s3", region_name="us-east-1", aws_access_key_id="x", aws_secret_access_key="y"
    )
    stub = Stubber(client)
    stub.add_response(
        "put_object",
        {},
        {"Bucket": "crm-backups", "Key": new_key, "Body": ANY, "ContentType": "application/gzip"},
    )
    listing = [{"Key": k} for k in [*old_keys, new_key, f"{prefix}README.txt"]]
    stub.add_response(
        "list_objects_v2",
        {"Contents": listing, "IsTruncated": False},
        {"Bucket": "crm-backups", "Prefix": prefix},
    )
    stub.add_response(
        "delete_objects",
        {"Deleted": []},
        {
            "Bucket": "crm-backups",
            "Delete": {"Objects": [{"Key": old_keys[1]}, {"Key": old_keys[0]}], "Quiet": True},
        },
    )
    monkeypatch.setattr(backup_module, "s3_client", lambda: client)
    with stub:
        out, _ = run("backup_db", "--pg-dump", fake_pg_dump)
    stub.assert_no_pending_responses()
    assert f"to s3://crm-backups/{new_key}; removed 2 old backup(s), keeping 14." in out


def test_backup_errors_are_clear(fake_pg_dump, tmp_path, settings):
    settings.AWS_BACKUP_BUCKET_NAME = ""
    with pytest.raises(CommandError, match="AWS_BACKUP_BUCKET_NAME"):
        run("backup_db")
    with pytest.raises(CommandError, match="at least 1"):
        run("backup_db", "--local-dir", str(tmp_path), "--keep", "0")
    with pytest.raises(CommandError, match="not found"):
        run("backup_db", "--local-dir", str(tmp_path), "--pg-dump", str(tmp_path / "missing"))
    failing = tmp_path / "pg_dump_old"
    failing.write_text(
        "#!/bin/sh\n"
        'echo "pg_dump: error: aborting because of server version mismatch" >&2\n'
        "exit 1\n"
    )
    failing.chmod(0o755)
    with pytest.raises(CommandError, match="version mismatch.*PG_DUMP_PATH"):
        run("backup_db", "--local-dir", str(tmp_path), "--pg-dump", str(failing))


def _compatible_pg_dump():
    binary = shutil.which(os.environ.get("PG_DUMP_PATH", "pg_dump"))
    if not binary:
        return None
    version = subprocess.run([binary, "--version"], capture_output=True, text=True).stdout
    match = re.search(r"(\d+)\.\d+", version)  # "pg_dump (PostgreSQL) 16.15 (Homebrew)"
    major = int(match.group(1)) if match else 0
    with connection.cursor():
        server_major = connection.pg_version // 10000
    return binary if major >= server_major else None


@pytest.mark.django_db(transaction=True)
def test_backup_with_real_pg_dump(tmp_path, rep):
    binary = _compatible_pg_dump()
    if binary is None:
        pytest.skip("no pg_dump matching the server version (set PG_DUMP_PATH to run this)")
    Lead.objects.create(name="Integration Lead", owner=rep)
    run("backup_db", "--local-dir", str(tmp_path), "--pg-dump", binary)
    (backup,) = tmp_path.iterdir()
    sql = gzip.decompress(backup.read_bytes()).decode()
    assert "CREATE TABLE public.leads_lead" in sql and "Integration Lead" in sql
    assert datetime.now(UTC).strftime("%Y%m%d") in backup.name
