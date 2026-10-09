from django.db import connection
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class HealthView(APIView):
    """Liveness + database check for deploys and uptime monitors. Reveals nothing sensitive."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses={200: dict, 503: dict})
    def get(self, request):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
        except Exception:
            return Response({"status": "error", "database": "unavailable"}, status=503)
        return Response({"status": "ok"})
