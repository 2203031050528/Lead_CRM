from django.utils import timezone
from rest_framework import viewsets

from apps.core.views import OwnerScopedMixin
from apps.notifications.models import notify

from .filters import TaskFilter
from .models import Task
from .serializers import TaskSerializer


def _notify_assignee(task: Task, actor) -> None:
    if task.assigned_to_id != actor.pk:
        notify(task.assigned_to, f"Task assigned to you: {task.title}", "/tasks")


class TaskViewSet(OwnerScopedMixin, viewsets.ModelViewSet):
    """Reps see only tasks assigned to them."""

    owner_field = "assigned_to"
    queryset = Task.objects.select_related("assigned_to", "lead", "deal")
    serializer_class = TaskSerializer
    filterset_class = TaskFilter
    search_fields = ["title", "description"]
    ordering_fields = ["due_at", "created_at", "completed_at", "is_done", "title"]

    @staticmethod
    def _completion(data, instance=None):
        if "is_done" not in data:
            return {}
        was_done = instance.is_done if instance else False
        if data["is_done"] and not was_done:
            return {"completed_at": timezone.now()}
        if not data["is_done"]:
            return {"completed_at": None}
        return {}

    def perform_create(self, serializer):
        data = serializer.validated_data
        task = serializer.save(
            created_by=self.request.user,
            assigned_to=data.get("assigned_to") or self.request.user,
            **self._completion(data),
        )
        _notify_assignee(task, self.request.user)

    def perform_update(self, serializer):
        old = serializer.instance
        old_assignee, old_due = old.assigned_to_id, old.due_at
        extra = self._completion(serializer.validated_data, old)
        new_due = serializer.validated_data.get("due_at", old_due)
        if new_due != old_due:
            extra["reminder_sent"] = False  # re-arm the reminder when rescheduled
        task = serializer.save(**extra)
        if task.assigned_to_id != old_assignee:
            _notify_assignee(task, self.request.user)
