import pytest
from django.contrib.admin.sites import site
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import RequestFactory

from apps.accounts.models import User
from apps.activities.models import Activity
from apps.audit.models import AuditLog
from apps.contacts.models import Contact
from apps.deals.models import Deal
from apps.leads.models import Lead
from apps.tasks.models import Task

pytestmark = pytest.mark.django_db


def test_role_helpers(admin_user, manager, rep):
    assert admin_user.is_admin_role and admin_user.is_manager_or_admin
    assert manager.is_manager_or_admin and not manager.is_admin_role
    assert not rep.is_manager_or_admin
    root = User.objects.create_superuser("root", "r@x.com", "pw")
    assert root.is_admin_role and root.role == User.Role.ADMIN


def test_lead_defaults(rep, source):
    lead = Lead.objects.create(name="Jane", owner=rep, source=source)
    assert lead.status == Lead.Status.NEW
    assert lead.created_at and lead.updated_at


def test_activity_requires_exactly_one_parent(rep, stage):
    lead = Lead.objects.create(name="L", owner=rep)
    deal = Deal.objects.create(title="D", stage=stage, owner=rep)
    Activity.objects.create(subject="ok", user=rep, lead=lead)
    with pytest.raises(IntegrityError), transaction.atomic():
        Activity.objects.create(subject="none", user=rep)
    with pytest.raises(IntegrityError), transaction.atomic():
        Activity.objects.create(subject="two", user=rep, lead=lead, deal=deal)


def test_task_at_most_one_parent(rep, stage):
    lead = Lead.objects.create(name="L", owner=rep)
    deal = Deal.objects.create(title="D", stage=stage, owner=rep)
    Task.objects.create(title="standalone", assigned_to=rep, created_by=rep)
    with pytest.raises(IntegrityError), transaction.atomic():
        Task.objects.create(title="x", assigned_to=rep, created_by=rep, lead=lead, deal=deal)


def test_admin_changes_are_audited(admin_user, rep):
    model_admin = site._registry[Contact]
    request = RequestFactory().post("/")
    request.user = admin_user
    contact = Contact(first_name="A", owner=rep)
    model_admin.save_model(request, contact, None, change=False)
    contact.first_name = "B"
    model_admin.save_model(request, contact, None, change=True)
    model_admin.delete_model(request, contact)
    logs = list(AuditLog.objects.order_by("id").values_list("action", "changes"))
    assert [a for a, _ in logs] == ["create", "update", "delete"]
    assert logs[1][1] == {"first_name": ["A", "B"]}


def test_seed_demo_is_rerunnable():
    call_command("seed_demo", leads=20)
    call_command("seed_demo", leads=20, reset=True)
    assert Lead.objects.count() == 20
    assert User.objects.filter(username__in=["admin", "manager", "rep1"]).count() == 3
