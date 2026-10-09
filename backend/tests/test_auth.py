import re

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User

pytestmark = pytest.mark.django_db


def test_login_me_logout(rep):
    c = APIClient()
    assert c.get("/api/v1/auth/me/").status_code == 403
    r = c.post("/api/v1/auth/login/", {"username": "rep", "password": "pass12345"})
    assert r.status_code == 200 and r.json()["role"] == "rep"
    assert c.get("/api/v1/auth/me/").json()["username"] == "rep"
    assert c.post("/api/v1/auth/logout/").status_code == 204
    assert c.get("/api/v1/auth/me/").status_code == 403


def test_login_failure_shape(rep):
    r = APIClient().post("/api/v1/auth/login/", {"username": "rep", "password": "nope"})
    assert r.status_code == 400
    assert r.json() == {"detail": "Invalid username or password.", "errors": {}}


def test_login_enforces_csrf(rep):
    c = APIClient(enforce_csrf_checks=True)
    r = c.post("/api/v1/auth/login/", {"username": "rep", "password": "pass12345"})
    assert r.status_code == 403
    c.get("/api/v1/auth/csrf/")
    token = c.cookies["csrftoken"].value
    r = c.post(
        "/api/v1/auth/login/",
        {"username": "rep", "password": "pass12345"},
        HTTP_X_CSRFTOKEN=token,
    )
    assert r.status_code == 200


def test_inactive_user_cannot_login(rep):
    rep.is_active = False
    rep.save()
    r = APIClient().post("/api/v1/auth/login/", {"username": "rep", "password": "pass12345"})
    assert r.status_code == 400


def test_change_password(api, rep):
    c = api(rep)
    bad = c.post(
        "/api/v1/auth/change-password/", {"old_password": "wrong", "new_password": "N3w-strong-pw"}
    )
    assert bad.status_code == 400 and "old_password" in bad.json()["errors"]
    ok = c.post(
        "/api/v1/auth/change-password/",
        {"old_password": "pass12345", "new_password": "N3w-strong-pw"},
    )
    assert ok.status_code == 204
    rep.refresh_from_db()
    assert rep.check_password("N3w-strong-pw")


def test_password_reset_flow(rep):
    c = APIClient()
    assert c.post("/api/v1/auth/password-reset/", {"email": "nobody@x.com"}).status_code == 204
    assert len(mail.outbox) == 0
    assert c.post("/api/v1/auth/password-reset/", {"email": "rep@example.com"}).status_code == 204
    assert len(mail.outbox) == 1
    uid, token = re.search(r"uid=([^&]+)&token=(\S+)", mail.outbox[0].body).groups()
    r = c.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uid": uid, "token": "bad-token", "new_password": "Reset-pw-123"},
    )
    assert r.status_code == 400
    r = c.post(
        "/api/v1/auth/password-reset/confirm/",
        {"uid": uid, "token": token, "new_password": "Reset-pw-123"},
    )
    assert r.status_code == 204
    assert User.objects.get(pk=rep.pk).check_password("Reset-pw-123")


@pytest.mark.parametrize("role,allowed", [("admin", True), ("manager", False), ("rep", False)])
def test_user_management_admin_only(api, admin_user, manager, rep, role, allowed):
    actor = {"admin": admin_user, "manager": manager, "rep": rep}[role]
    c = api(actor)
    assert c.get("/api/v1/users/").status_code == 200  # everyone can list for pickers
    r = c.post("/api/v1/users/", {"username": "new", "password": "Str0ng-pass!", "role": "rep"})
    assert (r.status_code == 201) is allowed
    r = c.delete(f"/api/v1/users/{rep.pk}/")
    assert (r.status_code == 204) is allowed
    rep.refresh_from_db()
    assert rep.is_active is not allowed  # deactivated, not deleted


def test_admin_cannot_deactivate_self(api, admin_user):
    assert api(admin_user).delete(f"/api/v1/users/{admin_user.pk}/").status_code == 400


def test_health_is_public_and_checks_the_database():
    r = APIClient().get("/api/v1/health/")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
