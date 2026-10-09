import gzip
import os
import re
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.core.s3 import s3_client

# libpq environment variables for connection options django-environ may put in OPTIONS.
LIBPQ_ENV = {
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "channel_binding": "PGCHANNELBINDING",
    "connect_timeout": "PGCONNECT_TIMEOUT",
}

RESTORE_HELP = """
Restore a backup (into an empty database):
  aws s3 cp s3://BUCKET/backups/DB/DB-YYYYmmdd-HHMMSS.sql.gz - | gunzip | psql "$DATABASE_URL"
"""


class Command(BaseCommand):
    help = (
        "pg_dump the database, gzip it and upload it to S3 (AWS_BACKUP_BUCKET_NAME), keeping the "
        "newest N backups. Run nightly from cron." + RESTORE_HELP
    )

    def add_arguments(self, parser):
        parser.add_argument("--keep", type=int, default=14, help="How many backups to keep (14).")
        parser.add_argument(
            "--local-dir",
            help="Write the backup to this directory instead of S3 (retention applies there).",
        )
        parser.add_argument(
            "--pg-dump",
            default=settings.PG_DUMP_PATH,
            help="pg_dump binary; must be the server's major version or newer.",
        )

    def handle(self, *args, keep, local_dir, pg_dump, **options):
        if keep < 1:
            raise CommandError("--keep must be at least 1.")
        bucket = settings.AWS_BACKUP_BUCKET_NAME
        if not local_dir and not bucket:
            raise CommandError("Set AWS_BACKUP_BUCKET_NAME, or pass --local-dir.")

        db = connection.settings_dict
        name = f"{db['NAME']}-{datetime.now(UTC):%Y%m%d-%H%M%S}.sql.gz"
        pattern = re.compile(rf"^{re.escape(db['NAME'])}-\d{{8}}-\d{{6}}\.sql\.gz$")
        with tempfile.TemporaryDirectory(prefix="crm-backup-") as tmp:
            path = Path(tmp) / name
            self.dump(pg_dump, db, path)
            size = path.stat().st_size
            if local_dir:
                target = Path(local_dir)
                target.mkdir(parents=True, exist_ok=True)
                shutil.move(path, target / name)
                removed = self.prune_local(target, pattern, keep)
                where = str(target / name)
            else:
                prefix = f"{settings.BACKUP_PREFIX.strip('/')}/{db['NAME']}/"
                with path.open("rb") as body:
                    s3_client().put_object(
                        Bucket=bucket, Key=prefix + name, Body=body, ContentType="application/gzip"
                    )
                removed = self.prune_s3(bucket, prefix, pattern, keep)
                where = f"s3://{bucket}/{prefix}{name}"
        shown = f"{size / 1024 / 1024:.1f} MB" if size >= 1024 * 1024 else f"{size / 1024:.0f} KB"
        self.stdout.write(
            f"Backed up {db['NAME']} ({shown}) to {where}; "
            f"removed {len(removed)} old backup(s), keeping {keep}."
        )

    def dump(self, pg_dump: str, db: dict, path: Path) -> None:
        """Stream pg_dump through gzip into `path`, never holding the dump in memory."""
        cmd = [pg_dump, "--format=plain", "--no-owner", "--no-privileges", "--dbname", db["NAME"]]
        for flag, key in (("--host", "HOST"), ("--port", "PORT"), ("--username", "USER")):
            if db.get(key):
                cmd += [flag, str(db[key])]
        env = {**os.environ, "PGPASSWORD": db.get("PASSWORD") or ""}  # never on the command line
        for option, value in (db.get("OPTIONS") or {}).items():
            if option in LIBPQ_ENV:
                env[LIBPQ_ENV[option]] = str(value)

        with tempfile.TemporaryFile() as errors, gzip.open(path, "wb", compresslevel=6) as out:
            try:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=errors, env=env)
            except FileNotFoundError as e:
                raise CommandError(
                    f"“{pg_dump}” not found. Install the PostgreSQL client matching the server "
                    "version, or set PG_DUMP_PATH / --pg-dump."
                ) from e
            shutil.copyfileobj(proc.stdout, out, length=1024 * 1024)
            code = proc.wait()
            errors.seek(0)
            message = errors.read().decode(errors="replace").strip()
        if code != 0:
            hint = (
                " (hint: use a pg_dump matching the server's major version; set PG_DUMP_PATH)"
                if "version mismatch" in message
                else ""
            )
            raise CommandError(f"pg_dump failed (exit {code}): {message}{hint}")

    @staticmethod
    def prune_local(directory: Path, pattern, keep: int) -> list[str]:
        backups = sorted((p for p in directory.iterdir() if pattern.match(p.name)), reverse=True)
        for old in backups[keep:]:
            old.unlink()
        return [p.name for p in backups[keep:]]

    @staticmethod
    def prune_s3(bucket: str, prefix: str, pattern, keep: int) -> list[str]:
        """Delete all but the newest `keep` backups. Names embed a UTC timestamp, so they sort
        chronologically; anything not named like a backup is left alone."""
        s3 = s3_client()
        keys = []
        for page in s3.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
            keys += [
                o["Key"] for o in page.get("Contents", []) if pattern.match(o["Key"][len(prefix) :])
            ]
        old = sorted(keys, reverse=True)[keep:]
        for i in range(0, len(old), 1000):
            s3.delete_objects(
                Bucket=bucket,
                Delete={"Objects": [{"Key": k} for k in old[i : i + 1000]], "Quiet": True},
            )
        return old
