from rest_framework import serializers
from rest_framework.permissions import SAFE_METHODS, BasePermission


def is_privileged(user) -> bool:
    """Managers and admins see all records; reps only their own."""
    return bool(user and user.is_authenticated and user.is_manager_or_admin)


def scope(queryset, user, owner_field: str = "owner"):
    if is_privileged(user):
        return queryset
    return queryset.filter(**{owner_field: user})


class IsAdminRole(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin_role)


class IsManagerOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return is_privileged(request.user)


class AdminWriteOrReadOnly(BasePermission):
    """Lookup tables (sources, tags, stages): everyone reads, admins write."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.method in SAFE_METHODS or request.user.is_admin_role


class ManagerCanDelete(BasePermission):
    """Reps may create and edit their own records but not delete them."""

    def has_permission(self, request, view):
        if request.method == "DELETE":
            return is_privileged(request.user)
        return True


class ScopedPrimaryKeyRelatedField(serializers.PrimaryKeyRelatedField):
    """FK input restricted to rows the requesting user can see."""

    def __init__(self, owner_field: str = "owner", **kwargs):
        self.owner_field = owner_field
        super().__init__(**kwargs)

    def get_queryset(self):
        qs = super().get_queryset()
        request = self.context.get("request")
        return scope(qs, request.user, self.owner_field) if request else qs
