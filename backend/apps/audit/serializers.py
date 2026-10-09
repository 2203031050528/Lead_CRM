from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.__str__", read_only=True, default="")

    class Meta:
        model = AuditLog
        fields = [
            "id",
            "actor",
            "actor_name",
            "action",
            "model",
            "object_id",
            "object_repr",
            "changes",
            "timestamp",
        ]
