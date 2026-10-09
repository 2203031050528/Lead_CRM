import json
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditLog
from apps.leads.importer import parse_amount
from apps.leads.models import Lead, LeadSource, Tag
from apps.notifications.models import Notification

pytestmark = pytest.mark.django_db
PREVIEW = "/api/v1/leads/import/preview/"
IMPORT = "/api/v1/leads/import/"


def upload(text: str, encoding="utf-8", name="leads.csv"):
    return SimpleUploadedFile(name, text.encode(encoding), content_type="text/csv")


def post_import(client, text, mapping, **flags):
    data = {"file": upload(text), "mapping": json.dumps(mapping)}
    data.update({k: "true" if v else "false" for k, v in flags.items()})
    return client.post(IMPORT, data, format="multipart")


GOOD = (
    "Full Name,E-mail,Company,Lead Source,Status,Amount,Owner,Tags\n"
    'Ada Lovelace,ada@example.com,Analytical,Website,Qualified,"$1,234.50",rep2,Hot; VIP\n'
    "Grace Hopper,grace@example.com,Navy,,contacted,,,\n"
)
MAPPING = ["name", "email", "company_name", "source", "status", "estimated_value", "owner", "tags"]


@pytest.fixture
def lookups(db):
    LeadSource.objects.create(name="Website")
    Tag.objects.create(name="Hot")
    Tag.objects.create(name="VIP")


def test_preview_detects_delimiter_bom_and_suggests_mapping(api, manager):
    header = "\ufeffFirst Name;Last Name;Email Address;Phone Number;Notes\n"
    text = header + "Ada;Lovelace;ada@x.io;123;hi\n\n;;;;\n"
    r = api(manager).post(PREVIEW, {"file": upload(text)}, format="multipart")
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["headers"] == ["First Name", "Last Name", "Email Address", "Phone Number", "Notes"]
    assert body["mapping"] == ["first_name", "last_name", "email", "phone", "notes"]
    assert body["rows"] == 1 and body["sample"] == [["Ada", "Lovelace", "ada@x.io", "123", "hi"]]


def test_preview_reads_windows_1252_files(api, manager):
    r = api(manager).post(
        PREVIEW, {"file": upload("Name\nRené Müller\n", "cp1252")}, format="multipart"
    )
    assert r.json()["sample"] == [["René Müller"]]


@pytest.mark.parametrize(
    "text,message",
    [
        ("", "empty"),
        ("Name,Email\n", "no data rows"),
        ("Name\n" + "x\n" * 5001, "more than 5,000 rows"),
    ],
)
def test_preview_rejects_bad_files(api, manager, text, message):
    r = api(manager).post(PREVIEW, {"file": upload(text)}, format="multipart")
    assert r.status_code == 400 and message in r.json()["errors"]["file"][0]


def test_dry_run_reports_row_errors_without_saving(api, manager, rep, other_rep, lookups):
    text = GOOD + (
        "Bad Email,not-an-email,,,,,,\n"  # row 4
        ",nobody@example.com,,,,,,\n"  # row 5: no name
        "X,,,Billboard,Converted,-5,ghost,Nope\n"  # row 6
    )
    r = post_import(api(manager), text, MAPPING, dry_run=True)
    assert r.status_code == 200
    body = r.json()
    assert (body["total"], body["valid"], body["invalid"], body["created"]) == (5, 2, 3, 0)
    errors = {e["row"]: e["errors"] for e in body["row_errors"]}
    assert set(errors) == {4, 5, 6}
    assert "email" in errors[4] and "name" in errors[5]
    assert set(errors[6]) == {"source", "status", "estimated_value", "owner", "tags"}
    assert "known: Website" in errors[6]["source"][0]
    assert Lead.objects.count() == 0


def test_import_is_all_or_nothing_unless_skipping(api, manager, rep, other_rep, lookups):
    bad = GOOD + "Bad Email,not-an-email,,,,,,\n"
    r = post_import(api(manager), bad, MAPPING, dry_run=False)
    assert r.status_code == 400 and r.json()["invalid"] == 1
    assert Lead.objects.count() == 0

    r = post_import(api(manager), bad, MAPPING, dry_run=False, skip_invalid=True)
    assert r.status_code == 201 and r.json()["created"] == 2
    ada = Lead.objects.get(email="ada@example.com")
    assert (ada.status, ada.estimated_value, ada.owner, ada.source.name) == (
        "qualified",
        Decimal("1234.50"),
        other_rep,
        "Website",
    )
    assert sorted(ada.tags.values_list("name", flat=True)) == ["Hot", "VIP"]
    grace = Lead.objects.get(email="grace@example.com")
    assert (grace.status, grace.owner) == ("contacted", manager)  # blank owner → importer
    assert AuditLog.objects.filter(model="lead", action="create").count() == 2
    note = Notification.objects.get(recipient=other_rep)
    assert note.message == "1 imported lead assigned to you"


def test_rep_imports_only_for_themselves(api, rep, other_rep):
    text = "Name,Owner\nMine,rep\nSneaky,rep2\nNo owner,\n"
    r = post_import(api(rep), text, ["name", "owner"], dry_run=False, skip_invalid=True)
    assert r.status_code == 201 and r.json()["created"] == 2
    assert r.json()["row_errors"][0]["row"] == 3
    assert set(Lead.objects.values_list("owner__username", flat=True)) == {"rep"}


def test_first_and_last_name_columns_combine(api, manager):
    r = post_import(
        api(manager), "First,Last\nAda,Lovelace\n", ["first_name", "last_name"], dry_run=False
    )
    assert r.status_code == 201 and Lead.objects.get().name == "Ada Lovelace"


@pytest.mark.parametrize(
    "mapping,message",
    [
        (["name", "name"], "more than one column"),
        (["email", ""], "Map a column to Name"),
        (["name"], "doesn't match the file"),
        (["name", "salary"], "Unknown field"),
    ],
)
def test_mapping_is_validated(api, manager, mapping, message):
    r = post_import(api(manager), "A,B\n1,2\n", mapping, dry_run=True)
    assert r.status_code == 400 and message in r.json()["errors"]["mapping"][0]


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("$1,234.50", "1234.50"),
        ("1.234,50", "1234.50"),
        ("12,5", "12.5"),
        ("1,234,567", "1234567"),
        ("EUR 99", "99"),
        ("-5", "-5"),
    ],
)
def test_parse_amount(raw, expected):
    assert parse_amount(raw) == Decimal(expected)


def test_large_import_uses_constant_queries(api, manager, lookups, django_assert_max_num_queries):
    rows = "".join(f"Lead {i},lead{i}@example.com,Website,Hot\n" for i in range(1000))
    with django_assert_max_num_queries(20):
        r = post_import(
            api(manager),
            "Name,Email,Source,Tags\n" + rows,
            ["name", "email", "source", "tags"],
            dry_run=False,
        )
    assert r.status_code == 201 and r.json()["created"] == 1000
    assert Lead.tags.through.objects.count() == 1000
