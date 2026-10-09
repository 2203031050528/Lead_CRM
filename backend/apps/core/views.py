from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.audit.models import AuditLog
from apps.audit.utils import diff, log, snapshot

from .permissions import ManagerCanDelete, scope


class OwnerScopedMixin:
    """Restrict the queryset to the user's own rows unless they are manager/admin."""

    owner_field = "owner"

    def get_queryset(self):
        return scope(super().get_queryset(), self.request.user, self.owner_field)


class AuditedModelViewSet(viewsets.ModelViewSet):
    """Writes an AuditLog row for every create, update and delete."""

    def create_kwargs(self, serializer) -> dict:
        return {}

    def perform_create(self, serializer):
        instance = serializer.save(**self.create_kwargs(serializer))
        log(self.request.user, AuditLog.Action.CREATE, instance, snapshot(instance))
        self.after_create(instance)

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        instance = serializer.save()
        changes = diff(before, snapshot(instance))
        if changes:
            log(self.request.user, AuditLog.Action.UPDATE, instance, changes)
        self.after_update(instance, changes)

    def perform_destroy(self, instance):
        log(self.request.user, AuditLog.Action.DELETE, instance, snapshot(instance))
        instance.delete()

    def after_create(self, instance):
        pass

    def after_update(self, instance, changes: dict):
        pass


class OwnedModelViewSet(OwnerScopedMixin, AuditedModelViewSet):
    """CRUD for owner-based records (Lead, Deal, Contact, Company)."""

    permission_classes = [IsAuthenticated, ManagerCanDelete]

    def create_kwargs(self, serializer):
        return {"owner": serializer.validated_data.get("owner") or self.request.user}
