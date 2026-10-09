from types import SimpleNamespace

import pytest

from apps.attachments import storage
from apps.attachments.models import Attachment
from apps.leads.models import Lead

pytestmark = pytest.mark.django_db
URL = "/api/v1/attachments/"


@pytest.fixture
def s3(monkeypatch):
    """In-memory stand-in for the S3 wrapper."""
    fake = SimpleNamespace(objects={}, deleted=[])
    monkeypatch.setattr(
        storage,
        "presigned_upload",
        lambda key, content_type, max_bytes: {
            "url": "https://s3.test/bucket",
            "fields": {"key": key, "Content-Type": content_type, "max": max_bytes},
        },
    )
    monkeypatch.setattr(storage, "object_info", lambda key: fake.objects.get(key))
    monkeypatch.setattr(
        storage,
        "presigned_download",
        lambda key, name, inline: f"https://s3.test/{key}?inline={inline}",
    )
    monkeypatch.setattr(storage, "delete_object", lambda key: fake.deleted.append(key))
    return fake


@pytest.fixture
def lead(rep):
    return Lead.objects.create(name="Acme", owner=rep)


def request_upload(client, **body):
    return client.post(f"{URL}upload-url/", body, format="json")


def test_upload_confirm_list_download_delete(api, rep, manager, lead, s3):
    c = api(rep)
    r = request_upload(c, filename="Q3 proposal.pdf", size=1000, lead=lead.pk)
    assert r.status_code == 200
    key = r.json()["upload"]["fields"]["key"]
    assert key.startswith(f"attachments/lead/{lead.pk}/") and key.endswith("/Q3_proposal.pdf")
    assert r.json()["upload"]["fields"]["max"] == 10 * 1024 * 1024
    token = r.json()["token"]

    missing = c.post(URL, {"token": token}, format="json")
    assert (
        missing.status_code == 400
        and "didn't reach storage" in missing.json()["errors"]["token"][0]
    )

    s3.objects[key] = {"ContentLength": 1000}
    r = c.post(URL, {"token": token}, format="json")
    assert r.status_code == 201
    body = r.json()
    assert (body["filename"], body["size"], body["content_type"], body["lead"]) == (
        "Q3 proposal.pdf",
        1000,
        "application/pdf",
        lead.pk,
    )
    again = c.post(URL, {"token": token}, format="json")
    assert again.status_code == 400 and "already been saved" in again.json()["errors"]["token"][0]

    assert [a["id"] for a in c.get(URL, {"lead": lead.pk}).json()["results"]] == [body["id"]]
    download = c.get(f"{URL}{body['id']}/download/", {"inline": "1"})
    assert download.status_code == 302 and download["Location"].endswith(f"{key}?inline=True")

    assert api(manager).delete(f"{URL}{body['id']}/").status_code == 204
    assert s3.deleted == [key] and not Attachment.objects.exists()


def test_other_reps_cannot_use_or_see_uploads(api, rep, other_rep, lead, s3):
    r = request_upload(api(other_rep), filename="x.txt", size=10, lead=lead.pk)
    assert r.status_code == 400 and "lead" in r.json()["errors"]

    token = request_upload(api(rep), filename="x.txt", size=10, lead=lead.pk).json()["token"]
    stolen = api(other_rep).post(URL, {"token": token}, format="json")
    assert stolen.status_code == 400 and "someone else" in stolen.json()["errors"]["token"][0]

    attachment = Attachment.objects.create(
        s3_key="k", filename="x.txt", size=10, uploaded_by=rep, lead=lead
    )
    assert api(other_rep).get(URL).json()["count"] == 0
    assert api(other_rep).get(f"{URL}{attachment.pk}/download/").status_code == 404
    assert api(other_rep).delete(f"{URL}{attachment.pk}/").status_code == 404


def test_tampered_tokens_and_bad_requests(api, rep, lead, stage, s3):
    c = api(rep)
    assert c.post(URL, {"token": "forged:token"}, format="json").status_code == 400
    too_big = request_upload(c, filename="big.zip", size=10 * 1024 * 1024 + 1, lead=lead.pk)
    assert too_big.status_code == 400 and "10 MB" in too_big.json()["errors"]["size"][0]
    assert request_upload(c, filename="a.txt", size=5).status_code == 400  # no parent
    from apps.deals.models import Deal

    deal = Deal.objects.create(title="D", owner=rep, stage=stage)
    both = request_upload(c, filename="a.txt", size=5, lead=lead.pk, deal=deal.pk)
    assert both.status_code == 400


def test_only_uploader_or_managers_delete(api, rep, manager, lead, s3):
    other_upload = Attachment.objects.create(
        s3_key="by-manager", filename="m.txt", size=1, uploaded_by=manager, lead=lead
    )
    assert api(rep).delete(f"{URL}{other_upload.pk}/").status_code == 403


def test_inline_only_for_safe_types(api, rep, lead, s3):
    html = Attachment.objects.create(
        s3_key="page",
        filename="page.html",
        size=1,
        content_type="text/html",
        uploaded_by=rep,
        lead=lead,
    )
    r = api(rep).get(f"{URL}{html.pk}/download/", {"inline": "1"})
    assert r["Location"].endswith("inline=False")


def test_storage_not_configured_returns_503(api, rep, lead, settings):
    settings.AWS_STORAGE_BUCKET_NAME = ""
    r = request_upload(api(rep), filename="a.txt", size=5, lead=lead.pk)
    assert r.status_code == 503 and r.json() == {
        "detail": "File storage is not configured.",
        "errors": {},
    }
