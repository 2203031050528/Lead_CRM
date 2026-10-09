from django.contrib.auth import get_user_model
from rest_framework import serializers


class OwnedSerializerMixin(serializers.Serializer):
    """Adds a writable `owner`; reps may only assign records to themselves."""

    owner = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.filter(is_active=True), required=False
    )
    owner_name = serializers.SerializerMethodField()

    def get_owner_name(self, obj) -> str:
        return str(obj.owner) if obj.owner_id else ""

    def validate_owner(self, value):
        user = self.context["request"].user
        if not user.is_manager_or_admin and value != user:
            raise serializers.ValidationError("Sales reps can only assign records to themselves.")
        return value
