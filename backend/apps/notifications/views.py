from drf_spectacular.utils import extend_schema
from rest_framework import mixins, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


class NotificationViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    filterset_fields = ["is_read"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        return Notification.objects.filter(recipient=self.request.user)

    @extend_schema(responses={200: dict})
    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        return Response({"count": self.get_queryset().filter(is_read=False).count()})

    @extend_schema(request=None, responses={200: dict})
    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        n = self.get_queryset().filter(is_read=False).update(is_read=True)
        return Response({"updated": n})
