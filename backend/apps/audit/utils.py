from decimal import Decimal

from django.db import models

from .models import AuditLog


def _value(v):
    if isinstance(v, Decimal):
        return str(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def snapshot(instance: models.Model) -> dict:
    """Concrete field values (FKs as ids), JSON-safe."""
    data = {}
    for f in instance._meta.concrete_fields:
        if f.name in ("created_at", "updated_at"):
            continue
        data[f.attname] = _value(getattr(instance, f.attname))
    return data


def diff(before: dict, after: dict) -> dict:
    return {k: [before.get(k), v] for k, v in after.items() if before.get(k) != v}


def log(actor, action: str, instance: models.Model, changes: dict | None = None) -> AuditLog:
    return AuditLog.objects.create(
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        model=instance._meta.model_name,
        object_id=str(instance.pk),
        object_repr=str(instance)[:200],
        changes=changes or {},
    )


class AuditedAdminMixin:
    """Log Django-admin changes the same way API changes are logged."""

    def save_model(self, request, obj, form, change):
        before = snapshot(type(obj).objects.get(pk=obj.pk)) if change else {}
        super().save_model(request, obj, form, change)
        after = snapshot(obj)
        if change:
            changes = diff(before, after)
            if changes:
                log(request.user, AuditLog.Action.UPDATE, obj, changes)
        else:
            log(request.user, AuditLog.Action.CREATE, obj, after)

    def delete_model(self, request, obj):
        log(request.user, AuditLog.Action.DELETE, obj, snapshot(obj))
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        for obj in queryset:
            log(request.user, AuditLog.Action.DELETE, obj, snapshot(obj))
        super().delete_queryset(request, queryset)
