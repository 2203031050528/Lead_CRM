import csv
import io

import pytest

from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.leads.models import Lead, Tag

pytestmark = pytest.mark.django_db


def read_csv(response):
    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv")
    assert response["Content-Disposition"].startswith('attachment; filename="')
    body = b"".join(response.streaming_content).decode("utf-8")
    assert body.startswith("﻿")
    return list(csv.DictReader(io.StringIO(body[1:])))


def test_lead_export_respects_scope_filters_and_escapes_formulas(api, rep, other_rep, manager):
    hot = Tag.objects.create(name="Hot")
    a = Lead.objects.create(
        name='=HYPERLINK("http://evil")', owner=rep, phone="+1 555", status="qualified"
    )
    a.tags.add(hot)
    Lead.objects.create(name="Plain", owner=rep)
    Lead.objects.create(name="Not mine", owner=other_rep)

    rows = read_csv(api(rep).get("/api/v1/leads/export/"))
    assert {r["name"] for r in rows} == {'\'=HYPERLINK("http://evil")', "Plain"}
    evil = next(r for r in rows if r["name"].startswith("'"))
    assert (evil["phone"], evil["status"], evil["tags"], evil["owner"]) == (
        "'+1 555",
        "Qualified",
        "Hot",
        "rep",
    )

    assert len(read_csv(api(manager).get("/api/v1/leads/export/"))) == 3
    filtered = read_csv(api(manager).get("/api/v1/leads/export/", {"status": "qualified"}))
    assert len(filtered) == 1
    searched = read_csv(api(manager).get("/api/v1/leads/export/", {"search": "plain"}))
    assert [r["name"] for r in searched] == ["Plain"]


def test_contact_and_deal_exports(api, rep, other_rep, stage):
    Contact.objects.create(first_name="Ann", owner=rep)
    Contact.objects.create(first_name="Bob", owner=other_rep)
    Deal.objects.create(title="Mine", owner=rep, stage=stage, value=10)
    Deal.objects.create(title="Theirs", owner=other_rep, stage=stage, value=20)
    assert [r["first_name"] for r in read_csv(api(rep).get("/api/v1/contacts/export/"))] == ["Ann"]
    deals = read_csv(api(rep).get("/api/v1/deals/export/"))
    assert [(d["title"], d["value"], d["stage"]) for d in deals] == [
        ("Mine", "10.00", "Prospecting")
    ]


def test_export_requires_login(api):
    assert api().get("/api/v1/leads/export/").status_code == 403
