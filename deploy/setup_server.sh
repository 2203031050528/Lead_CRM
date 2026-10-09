#!/usr/bin/env bash
# First-time setup of an Ubuntu 24.04 EC2 instance for Lead CRM. Safe to re-run.
#
#   scp -r deploy ubuntu@SERVER:~/crm-deploy
#   ssh ubuntu@SERVER sudo bash crm-deploy/setup_server.sh crm.example.com you@example.com
#
# The second argument (an email for Let's Encrypt) is optional; without it, HTTPS is left for later.
set -euo pipefail

DOMAIN="${1:?usage: sudo bash setup_server.sh <domain> [letsencrypt-email]}"
CERT_EMAIL="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP=/srv/crm
ENV_FILE=/etc/crm/crm.env
PG_VERSION=16

log() { printf '\n==> %s\n' "$*"; }
[[ $EUID -eq 0 ]] || { echo "Run as root: sudo bash $0 $*" >&2; exit 1; }
# shellcheck source=/dev/null
. /etc/os-release
[[ "${VERSION_ID:-}" == "24.04" ]] || echo "warning: written for Ubuntu 24.04; this is ${PRETTY_NAME:-unknown}" >&2

log "1/8 Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q nginx "postgresql-$PG_VERSION" postgresql-contrib python3.12-venv \
  certbot python3-certbot-nginx rsync curl ufw openssl

log "2/8 Swap (2 GB) - headroom for pip installs and traffic spikes on 1 GB of RAM"
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
printf 'vm.swappiness = 10\nvm.vfs_cache_pressure = 50\n' > /etc/sysctl.d/99-crm.conf
sysctl -q -p /etc/sysctl.d/99-crm.conf

log "3/8 App user and directories"
id crm &>/dev/null || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin crm
install -d -o crm -g crm -m 755 "$APP" "$APP/backend" "$APP/frontend" "$APP/frontend/out" "$APP/static" "$APP/deploy"
if [[ ! -x "$APP/venv/bin/python" ]]; then
  sudo -u crm python3.12 -m venv "$APP/venv"
  sudo -u crm "$APP/venv/bin/pip" install -q --no-cache-dir --upgrade pip wheel
fi

log "4/8 Settings file ($ENV_FILE)"
install -d -o root -g crm -m 750 /etc/crm
if [[ ! -f "$ENV_FILE" ]]; then
  db_password="$(openssl rand -hex 24)"
  secret_key="$(python3 -c 'import secrets; print(secrets.token_urlsafe(50))')"
  cat > "$ENV_FILE" <<EOF
# Lead CRM production settings (root:crm, mode 640). Gunicorn and cron read this file through
# DJANGO_ENV_FILE. After editing: sudo systemctl restart gunicorn
SECRET_KEY=$secret_key
DATABASE_URL=postgres://crm:$db_password@localhost:5432/crm
ALLOWED_HOSTS=$DOMAIN
CSRF_TRUSTED_ORIGINS=https://$DOMAIN
FRONTEND_URL=https://$DOMAIN
STATIC_ROOT=$APP/static
# Times in reminder emails, e.g. Asia/Kolkata
TIME_ZONE=UTC
# Turn on (31536000) once HTTPS works for the domain.
SECURE_HSTS_SECONDS=0

# Email - Amazon SES SMTP credentials
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
DEFAULT_FROM_EMAIL=Lead CRM <no-reply@$DOMAIN>

# S3 - credentials come from the instance's IAM role, so no keys here
AWS_REGION=us-east-1
AWS_STORAGE_BUCKET_NAME=
AWS_BACKUP_BUCKET_NAME=
PG_DUMP_PATH=/usr/lib/postgresql/$PG_VERSION/bin/pg_dump
EOF
  echo "created $ENV_FILE - fill in the email and S3 settings"
fi
chown root:crm "$ENV_FILE"
chmod 640 "$ENV_FILE"

log "5/8 PostgreSQL (low-memory settings, role, database)"
install -m 644 "$HERE/postgres/low-memory.conf" "/etc/postgresql/$PG_VERSION/main/conf.d/crm-low-memory.conf"
systemctl restart postgresql
db_password="$(sed -n 's#^DATABASE_URL=postgres://crm:\([^@]*\)@.*#\1#p' "$ENV_FILE")"
[[ -n "$db_password" ]] || { echo "could not read the database password from $ENV_FILE" >&2; exit 1; }
sudo -u postgres psql -q -v ON_ERROR_STOP=1 -v pw="$db_password" <<'SQL'
SELECT 'CREATE ROLE crm LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'crm') \gexec
ALTER ROLE crm WITH LOGIN PASSWORD :'pw';
SELECT 'CREATE DATABASE crm OWNER crm' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'crm') \gexec
SQL

log "6/8 Gunicorn (systemd socket + service) and cron"
install -m 644 "$HERE/systemd/gunicorn.socket" "$HERE/systemd/gunicorn.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now gunicorn.socket
systemctl enable gunicorn.service
install -m 644 "$HERE/cron/crm.cron" /etc/cron.d/crm   # no dot in the name, or cron ignores it

log "7/8 Nginx"
sed "s/CRM_DOMAIN/$DOMAIN/g" "$HERE/nginx/crm.conf" > /etc/nginx/sites-available/crm
ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/crm
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

log "8/8 Firewall (22, 80, 443 only) and HTTPS"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
if [[ -d "/etc/letsencrypt/live/$DOMAIN" ]]; then
  # Re-running: put back the HTTPS block certbot added before we rewrote the site file.
  certbot --nginx -d "$DOMAIN" --reinstall --redirect --non-interactive
elif [[ -n "$CERT_EMAIL" ]]; then
  certbot --nginx -d "$DOMAIN" -m "$CERT_EMAIL" --agree-tos --redirect --non-interactive
else
  echo "HTTPS skipped. Once DNS points here, run:"
  echo "  sudo certbot --nginx -d $DOMAIN -m you@example.com --agree-tos --redirect"
fi

cat <<EOF

Server ready. Next:
  1. Edit $ENV_FILE (email + S3 settings), then: sudo systemctl restart gunicorn
  2. Deploy the code: push to main (GitHub Actions) - see README "Deploy".
  3. Create the first admin:
     sudo -u crm env DJANGO_SETTINGS_MODULE=config.settings.prod DJANGO_ENV_FILE=$ENV_FILE \\
       $APP/venv/bin/python $APP/backend/manage.py createsuperuser
EOF
