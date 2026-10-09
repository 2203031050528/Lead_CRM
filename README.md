# Lead CRM

A lightweight lead-management CRM: leads → contacts, companies and a deals pipeline, with tasks,
activity timelines, attachments, CSV import/export, a dashboard and role-based access.

It is built to run on **one AWS EC2 t3.micro (1 GB RAM) without Docker**:

| Piece | How it runs |
|---|---|
| Frontend | Next.js **static export** (`frontend/out`), served by Nginx. No Node process in production. |
| API | Django + Django REST Framework under **Gunicorn (2 sync workers)**, systemd socket-activated. |
| Database | PostgreSQL 16 on the same instance, tuned for low memory. |
| Files | Amazon S3 via presigned URLs - uploads never touch the server. |
| Scheduled jobs | Linux **cron** → Django management commands (reminders, backups, cleanup). |
| Notifications | The browser polls every 60 s. No WebSockets, Redis or Celery. |
| Auth | Django session cookies + CSRF; frontend and API share one origin through Nginx. |

**Roles:** *Admin* (everything, including users/settings/audit log), *Manager* (all records and
reports, can reassign), *Sales Rep* (only their own leads, deals and tasks). Rules are enforced by the
API, not just hidden in the UI, and covered by tests.

```
backend/    Django project (config/ settings split: base, dev, test, prod) and apps/
frontend/   Next.js App Router + TypeScript + Tailwind (static export)
deploy/     Nginx site, systemd units, cron file, Postgres tuning, setup + deploy scripts, AWS JSON
.github/    CI (tests, lint, builds, config checks) and the deploy workflow
```

---

## Run it locally

Needs Python 3.12, Node 20+ and PostgreSQL 16 (the API reads `DATABASE_URL`; the default expects a
local role/database named `crm` with password `crm`).

```bash
git clone <your-repo-url> crm && cd crm/backend
psql -d postgres -c "CREATE ROLE crm LOGIN CREATEDB PASSWORD 'crm'" && createdb -O crm crm
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env
.venv/bin/python manage.py migrate && .venv/bin/python manage.py seed_demo
.venv/bin/python manage.py runserver                       # API on http://localhost:8000
cd ../frontend && npm ci && npm run dev                    # second terminal: http://localhost:3000
```

Sign in with **admin**, **manager**, **rep1**, **rep2** or **rep3** - password `demo12345`
(demo data from `seed_demo`; never run it on production).

In development Next.js proxies `/api/*` and `/admin/*` to Django (`DEV_API_ORIGIN`, default
`http://localhost:8000`). If port 3000 is taken, run `npx next dev -p 3100` and add
`http://localhost:3100` to `CSRF_TRUSTED_ORIGINS` in `backend/.env`.

### Tests and checks

```bash
cd backend
.venv/bin/pytest                     # API, permissions per role, import/export, attachments, commands
.venv/bin/ruff check . && .venv/bin/ruff format --check .
cd ../frontend
npm run lint && npx tsc --noEmit && npm run build   # build = the static export in out/
```

Tests always use `TEST_DATABASE_URL` (default: local `crm` role), never `DATABASE_URL`. One backup test
runs the real `pg_dump` only when it matches the server's major version - point `PG_DUMP_PATH` at one
(e.g. `/opt/homebrew/opt/postgresql@16/bin/pg_dump`) to include it.

### Configuration

All settings come from environment variables (or the env file). The important ones:

| Variable | Purpose |
|---|---|
| `SECRET_KEY`, `DATABASE_URL` | Required. |
| `ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`, `FRONTEND_URL` | Your domain, e.g. `crm.example.com` / `https://crm.example.com`. |
| `TIME_ZONE` | Timezone for times in reminder emails, e.g. `Asia/Kolkata`. The UI uses each browser's timezone. |
| `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `EMAIL_USE_TLS`, `DEFAULT_FROM_EMAIL` | SMTP (Amazon SES). |
| `AWS_REGION`, `AWS_STORAGE_BUCKET_NAME`, `AWS_BACKUP_BUCKET_NAME` | S3 buckets for attachments and backups. Keys are optional (instance role). |
| `AWS_S3_ENDPOINT_URL` | Optional S3-compatible endpoint for local testing (e.g. MinIO). |
| `STATIC_ROOT`, `PG_DUMP_PATH`, `BACKUP_PREFIX`, `SECURE_HSTS_SECONDS` | Server paths and HTTPS hardening. |
| `DJANGO_ENV_FILE` | Where to read the env file from (servers: `/etc/crm/crm.env`). |

The settings module comes from the process environment: `manage.py` defaults to
`config.settings.dev`, Gunicorn (`wsgi.py`) to `config.settings.prod`.

API docs (OpenAPI/Swagger) are at `/api/v1/docs/`.

---

## Deploy to AWS

You need: an AWS account, a domain you can add DNS records to, and this repository on GitHub.
Everything below is a one-time setup; afterwards every push to `main` tests and deploys automatically.

### 1. S3 buckets (attachments and backups)

Create two buckets in your region, both with **Block all public access** on, e.g.
`crm-attachments-<you>` and `crm-backups-<you>`.

On the **attachments** bucket, add the CORS rule from `deploy/aws/s3-cors-attachments.json` (replace
`CRM_DOMAIN` with your domain). Browsers upload straight to this bucket, so without it uploads fail.

```bash
aws s3api put-bucket-cors --bucket crm-attachments-<you> \
  --cors-configuration file://deploy/aws/s3-cors-attachments.json
```

Optional on the backups bucket: a lifecycle rule moving `backups/` to a cheaper storage class. The
backup command itself keeps only the newest 14.

### 2. IAM role for the instance

Create a policy from `deploy/aws/iam-policy.json` (replace `ATTACHMENTS_BUCKET` and `BACKUP_BUCKET`),
attach it to a new IAM role for EC2, e.g. `crm-ec2`. The app then gets credentials from the instance -
no access keys on the server.

### 3. Email (Amazon SES)

Verify your domain (or sender address) in SES, request production access (to email anyone, not just
verified addresses), and create **SMTP credentials**. Note the SMTP endpoint for your region.

### 4. Launch the instance

* AMI **Ubuntu Server 24.04 LTS**, type **t3.micro**, 20 GB gp3 disk.
* A key pair for SSH; IAM instance profile **crm-ec2**.
* Security group inbound: **22** (your IP only), **80** and **443** (anywhere).
* Allocate an **Elastic IP** and associate it, then create a DNS **A record** `crm.example.com → <Elastic IP>`.

### 5. Set up the server

From your machine, in this repository:

```bash
scp -r deploy ubuntu@crm.example.com:~/crm-deploy
ssh ubuntu@crm.example.com 'sudo bash crm-deploy/setup_server.sh crm.example.com you@example.com'
```

`setup_server.sh` is idempotent (safe to run again). It installs Nginx, PostgreSQL 16, Python 3.12
and Certbot; creates a 2 GB swap file; applies the low-memory Postgres settings; creates the database
and its role; creates the `crm` app user and `/srv/crm`; writes `/etc/crm/crm.env` with a generated
`SECRET_KEY` and database password; installs the Gunicorn systemd units, the cron file and the Nginx
site; enables UFW (22, 80, 443 only); and gets a Let's Encrypt certificate (if DNS already points at
the server - otherwise it prints the certbot command to run later).

Then fill in email and S3 settings:

```bash
ssh ubuntu@crm.example.com
sudo nano /etc/crm/crm.env     # EMAIL_HOST_USER/PASSWORD, AWS_STORAGE_BUCKET_NAME, AWS_BACKUP_BUCKET_NAME, TIME_ZONE
```

### 6. Connect GitHub Actions

In the repository: **Settings → Secrets and variables → Actions**, add:

| Secret | Value |
|---|---|
| `EC2_HOST` | `crm.example.com` (or the Elastic IP) |
| `EC2_USER` | `ubuntu` (optional; this is the default) |
| `EC2_SSH_KEY` | A private key whose public half is in `~ubuntu/.ssh/authorized_keys` on the server. Best: a dedicated deploy key (`ssh-keygen -t ed25519 -f crm-deploy`). |
| `EC2_KNOWN_HOSTS` | Output of `ssh-keyscan -H crm.example.com` (pins the server's host key). |
| `CRM_DOMAIN` | `crm.example.com` (optional; enables the post-deploy smoke test). |

The deploy job uses the `production` environment, so you can require manual approval there.

### 7. First deploy

Push to `main` (or run **Deploy** manually from the Actions tab). The workflow:

1. runs CI - backend tests against PostgreSQL 16, lint, schema/migration checks, the frontend
   lint/type-check/static build, and checks of the Nginx/systemd/cron/shell files;
2. builds the frontend;
3. rsyncs `backend/`, `deploy/` and `frontend/out/` to `/srv/crm` over SSH;
4. runs `deploy/remote_deploy.sh` on the server: installs Python requirements (only when they
   changed), `check --deploy`, `migrate`, `collectstatic`, refreshes the cron file and systemd units,
   restarts Gunicorn and waits for `/api/v1/health/`;
5. removes frontend files from the previous release, and smoke-tests the public URL.

### 8. Create the first admin

```bash
sudo -u crm env DJANGO_SETTINGS_MODULE=config.settings.prod DJANGO_ENV_FILE=/etc/crm/crm.env \
  /srv/crm/venv/bin/python /srv/crm/backend/manage.py createsuperuser
```

Sign in at `https://crm.example.com`, then add lead sources, tags and pipeline stages under
**Settings**, and invite your team under **Settings → Users**.

### 9. Finish HTTPS hardening

When `https://crm.example.com` works, set `SECURE_HSTS_SECONDS=31536000` in `/etc/crm/crm.env` and
`sudo systemctl restart gunicorn`. Certbot renews the certificate automatically (`systemctl list-timers`
shows `certbot.timer`).

---

## Operating it

| Task | Command |
|---|---|
| App logs | `journalctl -u gunicorn -f` |
| Cron job logs | `journalctl -t crm-reminders -t crm-backup -t crm-cleanup --since today` |
| Restart after editing `/etc/crm/crm.env` | `sudo systemctl restart gunicorn` |
| Run a management command | `sudo -u crm env DJANGO_SETTINGS_MODULE=config.settings.prod DJANGO_ENV_FILE=/etc/crm/crm.env /srv/crm/venv/bin/python /srv/crm/backend/manage.py <command>` |
| Memory | `free -m` and `systemctl status gunicorn postgresql nginx` |
| Re-apply Nginx/swap/firewall config | re-run `setup_server.sh` (keeps the certificate and the env file) |

**Scheduled jobs** (`/etc/cron.d/crm`, times in UTC):

| Job | When | What |
|---|---|---|
| `send_task_reminders` | every 15 min | In-app + email reminders for open tasks due within the hour |
| `backup_db` | 21:30 UTC daily (03:00 IST) | `pg_dump` → gzip → S3, keeps the newest 14 |
| `cleanup_notifications` | Sundays 22:00 UTC | Deletes read notifications older than 60 days |

Each takes `--dry-run` (reminders, cleanup) or `--local-dir` (backups) for manual checks.

**Restore a backup** into an empty database:

```bash
aws s3 ls s3://crm-backups-<you>/backups/crm/
sudo -u postgres createdb -O crm crm_restored
aws s3 cp s3://crm-backups-<you>/backups/crm/crm-YYYYmmdd-HHMMSS.sql.gz - | gunzip \
  | sudo -u postgres psql -d crm_restored -v ON_ERROR_STOP=1 -c 'SET ROLE crm' -f -
```

Point `DATABASE_URL` at `crm_restored` (or rename the databases) and restart Gunicorn to switch over.

**Roll back** a bad release: revert the commit and push to `main` - the pipeline redeploys the previous
code. Migrations are not reversed automatically; if one must be undone, run `manage.py migrate <app>
<previous_migration>` on the server first.

### Memory budget (1 GB instance)

| Process | Approx. RSS |
|---|---|
| Gunicorn (master + 2 workers) | ~170 MB at start, ~240 MB warm (workers recycle every ~500 requests) |
| PostgreSQL (`shared_buffers=128MB`, ≤ 20 connections) | ~150–200 MB |
| Nginx | ~10 MB |
| **Idle total** | **~350–450 MB**, plus 2 GB swap as headroom for `pip install` and spikes |

Measured locally with the production Gunicorn flags; check the real numbers on the server with
`ps -o rss,cmd -C gunicorn -C postgres -C nginx`.

### Troubleshooting

* **502 Bad Gateway** - Gunicorn isn't running: `systemctl status gunicorn`, `journalctl -u gunicorn -n 100`.
* **403 on login / "CSRF verification failed"** - `CSRF_TRUSTED_ORIGINS` must be `https://<your domain>`.
* **Uploads fail** - check the attachments bucket's CORS rule and the instance role's policy.
* **No reminder emails** - SES credentials/sandbox; `journalctl -t crm-reminders`. In-app reminders still arrive.
* **Backup fails with "version mismatch"** - `PG_DUMP_PATH` must point at PostgreSQL 16's `pg_dump`.
