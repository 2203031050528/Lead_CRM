from django.db.models import Q
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.core.permissions import is_privileged

from .models import Activity
from .serializers import ActivitySerializer


class IsAuthorOrPrivileged(IsAuthenticated):
    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return obj.user_id == request.user.pk or is_privileged(request.user)


class ActivityViewSet(viewsets.ModelViewSet):
    queryset = Activity.objects.select_related("user")
    serializer_class = ActivitySerializer
    permission_classes = [IsAuthorOrPrivileged]
    filterset_fields = ["type", "lead", "deal", "contact", "user"]
    search_fields = ["subject", "body"]
    ordering_fields = ["occurred_at", "created_at"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_privileged(user):
            return qs
        return qs.filter(Q(lead__owner=user) | Q(deal__owner=user) | Q(contact__owner=user))

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
