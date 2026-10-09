import pytest

from apps.accounts.models import User
from apps.deals.models import PipelineStage
from apps.leads.models import LeadSource


def make_user(username: str, role: str = User.Role.REP, **kw) -> User:
    user = User(username=username, role=role, email=f"{username}@example.com", **kw)
    user.set_password("pass12345")
    user.save()
    return user


@pytest.fixture
def admin_user(db):
    return make_user("admin", User.Role.ADMIN)


@pytest.fixture
def manager(db):
    return make_user("manager", User.Role.MANAGER)


@pytest.fixture
def rep(db):
    return make_user("rep", User.Role.REP)


@pytest.fixture
def other_rep(db):
    return make_user("rep2", User.Role.REP)


@pytest.fixture
def stage(db):
    return PipelineStage.objects.create(name="Prospecting", order=0)


@pytest.fixture
def source(db):
    return LeadSource.objects.create(name="Website")


@pytest.fixture
def api():
    """Returns a function that gives an APIClient logged in as the given user."""
    from rest_framework.test import APIClient

    def _client(user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client

    return _client
