from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsManagerOrAdmin
from apps.core.timezones import request_timezone

from .services import PERIODS, dashboard, rep_performance

TZ_PARAM = OpenApiParameter("tz", str, description="Viewer's IANA timezone, e.g. Asia/Kolkata")


class DashboardView(APIView):
    """KPIs and chart data, scoped to the user's own records for sales reps."""

    @extend_schema(parameters=[TZ_PARAM], responses={200: dict})
    def get(self, request):
        return Response(dashboard(request.user, request_timezone(request)))


class PerformanceView(APIView):
    permission_classes = [IsManagerOrAdmin]

    @extend_schema(
        parameters=[TZ_PARAM, OpenApiParameter("period", str, enum=list(PERIODS))],
        responses={200: dict},
    )
    def get(self, request):
        period = request.query_params.get("period", "this_month")
        if period not in PERIODS:
            raise ValidationError({"period": [f"Choose one of: {', '.join(PERIODS)}."]})
        return Response(rep_performance(request_timezone(request), period))
