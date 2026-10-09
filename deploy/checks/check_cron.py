"""Format check for deploy/cron/crm.cron (system crontab: env lines, or 5 time fields + user + command)."""

import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "deploy/cron/crm.cron"
text = open(path).read()
assert text.endswith("\n"), "cron files must end with a newline"
field = re.compile(r"^(\*|\d+(-\d+)?)(/\d+)?(,(\d+(-\d+)?)(/\d+)?)*$")
jobs = 0
for n, line in enumerate(text.splitlines(), 1):
    if not line.strip() or line.startswith("#") or re.match(r"^[A-Z_]+=", line):
        continue
    parts = line.split(None, 6)
    assert len(parts) == 7, f"line {n}: expected 5 time fields, a user and a command"
    assert all(field.match(p) for p in parts[:5]), f"line {n}: bad time field"
    assert parts[5] == "crm", f"line {n}: jobs must run as the crm user"
    assert "flock -n" in parts[6] and "logger -t crm-" in parts[6], f"line {n}: missing flock/logger"
    jobs += 1
assert jobs == 3, f"expected 3 jobs, found {jobs}"
print(f"{path}: {jobs} jobs OK")
