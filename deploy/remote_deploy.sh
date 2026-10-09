#!/usr/bin/env bash
# Runs on the server (as root) after GitHub Actions has rsynced backend/, deploy/ and frontend/out/.
set -euo pipefail

APP=/srv/crm
ENV_FILE=/etc/crm/crm.env
as_crm() { sudo -u crm env DJANGO_SETTINGS_MODULE=config.settings.prod DJANGO_ENV_FILE="$ENV_FILE" "$@"; }
log() { printf '==> %s\n' "$*"; }

cd "$APP/backend"

log "Python packages"
stamp="$APP/.requirements.sha256"
wanted="$(sha256sum requirements.txt | cut -d' ' -f1)"
if [[ "$(cat "$stamp" 2>/dev/null || true)" != "$wanted" ]]; then
  as_crm "$APP/venv/bin/pip" install -q --no-cache-dir -r requirements.txt
  echo "$wanted" > "$stamp"
else
  echo "requirements unchanged"
fi

log "Checks, migrations, static files"
as_crm "$APP/venv/bin/python" manage.py check --deploy --fail-level ERROR
as_crm "$APP/venv/bin/python" manage.py migrate --noinput
as_crm "$APP/venv/bin/python" manage.py collectstatic --noinput -v 0

log "System config shipped with the code"
if ! cmp -s "$APP/deploy/cron/crm.cron" /etc/cron.d/crm; then
  install -m 644 "$APP/deploy/cron/crm.cron" /etc/cron.d/crm
  echo "cron updated"
fi
units_changed=0
for unit in gunicorn.socket gunicorn.service; do
  if ! cmp -s "$APP/deploy/systemd/$unit" "/etc/systemd/system/$unit"; then
    install -m 644 "$APP/deploy/systemd/$unit" "/etc/systemd/system/$unit"
    units_changed=1
  fi
done
if [[ $units_changed -eq 1 ]]; then
  systemctl daemon-reload
  echo "systemd units updated"
fi

log "Restart Gunicorn"
systemctl restart gunicorn.service

host="$(sed -n 's/^ALLOWED_HOSTS=\([^,]*\).*/\1/p' "$ENV_FILE")"
for _ in $(seq 1 30); do
  if curl -fsS --unix-socket /run/gunicorn.sock -H "Host: $host" -H "X-Forwarded-Proto: https" \
      http://localhost/api/v1/health/ >/dev/null 2>&1; then
    log "Deploy OK - $(date -u +%FT%TZ)"
    exit 0
  fi
  sleep 1
done
echo "Gunicorn did not become healthy; recent logs:" >&2
journalctl -u gunicorn.service -n 60 --no-pager >&2
exit 1
