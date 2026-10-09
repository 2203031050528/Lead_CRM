"""CSV lead import: parse the file, suggest a column mapping, validate every row, bulk insert.

Runs synchronously (no task queue on a 1 GB box), so lookups are loaded once and rows are
inserted with bulk_create: a 5,000-row file costs a handful of queries, not thousands.
"""

import csv
import io
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction

from apps.accounts.models import User
from apps.audit.models import AuditLog
from apps.audit.utils import snapshot
from apps.notifications.models import Notification

from .models import Lead, LeadSource, Tag

MAX_ROWS = 5000
MAX_BYTES = 10 * 1024 * 1024
MAX_ERRORS_RETURNED = 500

FIELDS = {
    "name": "Name",
    "first_name": "First name",
    "last_name": "Last name",
    "email": "Email",
    "phone": "Phone",
    "company_name": "Company",
    "source": "Source",
    "status": "Status",
    "estimated_value": "Estimated value",
    "owner": "Owner (username or email)",
    "tags": "Tags (separated by ; or ,)",
    "notes": "Notes",
}

# Header spellings we recognise, compared lowercase with spaces/punctuation removed.
ALIASES = {
    "name": {"name", "fullname", "leadname", "contactname", "contact"},
    "first_name": {"firstname", "first", "givenname"},
    "last_name": {"lastname", "last", "surname", "familyname"},
    "email": {"email", "emailaddress", "mail"},
    "phone": {"phone", "phonenumber", "mobile", "mobilephone", "telephone", "tel", "cell"},
    "company_name": {"company", "companyname", "organization", "organisation", "account"},
    "source": {"source", "leadsource", "channel"},
    "status": {"status", "leadstatus"},
    "estimated_value": {"value", "estimatedvalue", "amount", "dealvalue", "budget"},
    "owner": {"owner", "assignedto", "assignee", "rep", "salesrep", "leadowner"},
    "tags": {"tags", "tag", "labels"},
    "notes": {"notes", "note", "comments", "comment", "description"},
}


class CsvImportError(Exception):
    """A problem with the file or mapping as a whole, as opposed to a single row."""


@dataclass
class ParsedCsv:
    headers: list[str]
    rows: list[tuple[int, list[str]]]  # (spreadsheet row number, cells); the header is row 1


@dataclass
class ImportResult:
    total: int
    valid: int
    invalid: int
    row_errors: list[dict] = field(default_factory=list)
    created: int = 0


def parse_csv(upload) -> ParsedCsv:
    if upload.size > MAX_BYTES:
        raise CsvImportError("The file is larger than 10 MB.")
    text = _decode(upload.read())
    reader = csv.reader(io.StringIO(text, newline=""), delimiter=_sniff_delimiter(text[:4096]))
    headers: list[str] | None = None
    rows: list[tuple[int, list[str]]] = []
    try:
        for number, cells in enumerate(reader, start=1):
            if not any(c.strip() for c in cells):
                continue
            if headers is None:
                headers = _clean_headers(cells)
                continue
            rows.append((number, cells))
            if len(rows) > MAX_ROWS:
                raise CsvImportError(
                    f"The file has more than {MAX_ROWS:,} rows. Split it into smaller files."
                )
    except csv.Error as e:
        raise CsvImportError(f"Couldn't read the CSV near line {reader.line_num}: {e}.") from e
    if headers is None:
        raise CsvImportError("The file is empty.")
    if not rows:
        raise CsvImportError("The file has a header row but no data rows.")
    return ParsedCsv(headers, rows)


def _decode(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "cp1252"):  # cp1252: Excel's "CSV" on Windows
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1")


def _sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t|").delimiter
    except csv.Error:
        return ","


def _clean_headers(cells: list[str]) -> list[str]:
    headers, seen = [], Counter()
    for i, cell in enumerate(cells):
        name = cell.strip() or f"Column {i + 1}"
        seen[name] += 1
        headers.append(name if seen[name] == 1 else f"{name} ({seen[name]})")
    return headers


def _key(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def suggest_mapping(headers: list[str]) -> list[str]:
    """One target field per column ("" = don't import), each field used at most once."""
    used: set[str] = set()
    mapping = []
    for header in headers:
        key = _key(header)
        match = next((f for f, names in ALIASES.items() if key in names and f not in used), "")
        used.add(match)
        mapping.append(match)
    return mapping


def validate_mapping(mapping, headers: list[str]) -> list[str]:
    if (
        not isinstance(mapping, list)
        or len(mapping) != len(headers)
        or not all(isinstance(m, str) for m in mapping)
    ):
        raise CsvImportError("The column mapping doesn't match the file. Upload it again.")
    unknown = sorted({m for m in mapping if m and m not in FIELDS})
    if unknown:
        raise CsvImportError(f"Unknown field: {', '.join(unknown)}.")
    repeated = [f for f, n in Counter(m for m in mapping if m).items() if n > 1]
    if repeated:
        raise CsvImportError(f"“{FIELDS[repeated[0]]}” is mapped to more than one column.")
    if not {"name", "first_name", "last_name"} & set(mapping):
        raise CsvImportError("Map a column to Name (or to First name / Last name).")
    return mapping


def parse_amount(text: str) -> Decimal:
    """'$1,234.50', '1.234,50', '1234' → Decimal. Raises InvalidOperation if it isn't a number."""
    s = re.sub(r"[^\d.,\-]", "", text)
    if not re.search(r"\d", s) or s.count("-") > 1 or ("-" in s and not s.startswith("-")):
        raise InvalidOperation
    if "," in s and "." in s:  # the later separator is the decimal point
        s = (
            s.replace(".", "").replace(",", ".")
            if s.rfind(",") > s.rfind(".")
            else s.replace(",", "")
        )
    elif "," in s:  # 1,234 → thousands; 12,5 → decimal comma
        head, _, tail = s.rpartition(",")
        s = s.replace(",", "") if len(tail) == 3 else f"{head.replace(',', '')}.{tail}"
    return Decimal(s)


class RowValidator:
    """Turns one mapped row into an unsaved Lead (plus tag ids) or a dict of field errors."""

    def __init__(self, user):
        self.user = user
        self.privileged = user.is_manager_or_admin
        self.sources = {s.name.lower(): s for s in LeadSource.objects.all()}
        self.tags = {t.name.lower(): t for t in Tag.objects.all()}
        self.users: dict[str, User] = {}
        if self.privileged:
            for u in User.objects.filter(is_active=True):
                self.users[u.username.lower()] = u
                if u.email:
                    self.users.setdefault(u.email.lower(), u)
        self.statuses = {}
        for value, label in Lead.Status.choices:
            self.statuses[value] = value
            self.statuses[label.lower()] = value

    def __call__(self, data: dict[str, str]):
        errors: dict[str, list[str]] = defaultdict(list)
        name = data.get("name") or " ".join(
            part for part in (data.get("first_name"), data.get("last_name")) if part
        )
        if not name:
            errors["name"].append("Name is required.")
        for key, limit in (("name", 200), ("email", 254), ("phone", 30), ("company_name", 200)):
            value = name if key == "name" else data.get(key, "")
            if len(value) > limit:
                errors[key].append(f"Longer than {limit} characters.")

        email = data.get("email", "")
        if email:
            try:
                validate_email(email)
            except ValidationError:
                errors["email"].append(f"“{email}” is not a valid email address.")

        source = None
        if data.get("source"):
            source = self.sources.get(data["source"].lower())
            if source is None:
                known = ", ".join(s.name for s in self.sources.values()) or "none yet"
                errors["source"].append(f"Unknown source “{data['source']}” (known: {known}).")

        status = Lead.Status.NEW
        if data.get("status"):
            status = self.statuses.get(data["status"].lower())
            if status is None:
                errors["status"].append(
                    f"Unknown status “{data['status']}”. Use New, Contacted, Qualified or Lost."
                )
            elif status == Lead.Status.CONVERTED:
                errors["status"].append("Leads can't be imported as Converted.")

        value = Decimal("0.00")
        if data.get("estimated_value"):
            try:
                value = parse_amount(data["estimated_value"]).quantize(Decimal("0.01"))
                if value < 0 or value >= Decimal("1e10"):
                    raise InvalidOperation
            except InvalidOperation:
                errors["estimated_value"].append(
                    f"“{data['estimated_value']}” is not a valid amount."
                )

        owner = self.user
        if data.get("owner"):
            wanted = data["owner"].lower()
            if self.privileged:
                owner = self.users.get(wanted)
                if owner is None:
                    errors["owner"].append(
                        f"No active user with username or email “{data['owner']}”."
                    )
            elif wanted not in {self.user.username.lower(), (self.user.email or "").lower()}:
                errors["owner"].append("Sales reps can only import leads assigned to themselves.")

        tag_ids: list[int] = []
        for tag_name in filter(None, (t.strip() for t in re.split(r"[;,|]", data.get("tags", "")))):
            tag = self.tags.get(tag_name.lower())
            if tag is None:
                errors["tags"].append(f"Unknown tag “{tag_name}”.")
            elif tag.pk not in tag_ids:
                tag_ids.append(tag.pk)

        if errors:
            return None, [], dict(errors)
        lead = Lead(
            name=name,
            email=email,
            phone=data.get("phone", ""),
            company_name=data.get("company_name", ""),
            source=source,
            status=status,
            estimated_value=value,
            owner=owner,
            notes=data.get("notes", ""),
        )
        return lead, tag_ids, {}


def run_import(parsed: ParsedCsv, mapping: list[str], user, *, commit: bool, skip_invalid: bool):
    validate = RowValidator(user)
    good, errors = [], []
    for number, cells in parsed.rows:
        data = {
            target: (cells[i].strip() if i < len(cells) else "")
            for i, target in enumerate(mapping)
            if target
        }
        lead, tag_ids, row_errors = validate(data)
        if row_errors:
            errors.append({"row": number, "errors": row_errors})
        else:
            good.append((lead, tag_ids))
    result = ImportResult(
        total=len(parsed.rows),
        valid=len(good),
        invalid=len(errors),
        row_errors=errors[:MAX_ERRORS_RETURNED],
    )
    if commit and good and (not errors or skip_invalid):
        result.created = _save(good, user)
    return result


@transaction.atomic
def _save(good: list[tuple[Lead, list[int]]], user) -> int:
    leads = Lead.objects.bulk_create([lead for lead, _ in good], batch_size=500)
    through = Lead.tags.through
    through.objects.bulk_create(
        [
            through(lead_id=lead.pk, tag_id=tag_id)
            for lead, (_, tag_ids) in zip(leads, good, strict=True)
            for tag_id in tag_ids
        ],
        batch_size=1000,
    )
    AuditLog.objects.bulk_create(
        [
            AuditLog(
                actor=user,
                action=AuditLog.Action.CREATE,
                model="lead",
                object_id=str(lead.pk),
                object_repr=str(lead)[:200],
                changes={**snapshot(lead), "via": "csv import"},
            )
            for lead in leads
        ],
        batch_size=500,
    )
    per_owner = Counter(lead.owner_id for lead in leads if lead.owner_id != user.pk)
    Notification.objects.bulk_create(
        [
            Notification(
                recipient_id=owner_id,
                message=f"{n} imported lead{'s' if n != 1 else ''} assigned to you",
                link="/leads",
            )
            for owner_id, n in per_owner.items()
        ]
    )
    return len(leads)
