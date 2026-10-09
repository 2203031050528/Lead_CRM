from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.contacts.models import Company, Contact
from apps.deals.models import Deal
from apps.leads.models import Lead

from .permissions import scope

LIMIT = 5


class GlobalSearchView(APIView):
    """Top-bar search: up to 5 hits per type, scoped to what the user may see."""

    @extend_schema(parameters=[OpenApiParameter("q", str)], responses={200: dict})
    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"leads": [], "contacts": [], "companies": [], "deals": []})
        user = request.user
        leads = scope(Lead.objects.all(), user).filter(
            Q(name__icontains=q)
            | Q(email__icontains=q)
            | Q(phone__icontains=q)
            | Q(company_name__icontains=q)
        )[:LIMIT]
        contacts = scope(Contact.objects.all(), user).filter(
            Q(first_name__icontains=q) | Q(last_name__icontains=q) | Q(email__icontains=q)
        )[:LIMIT]
        companies = scope(Company.objects.all(), user).filter(name__icontains=q)[:LIMIT]
        deals = scope(Deal.objects.all(), user).filter(title__icontains=q)[:LIMIT]
        return Response(
            {
                "leads": [{"id": o.pk, "label": o.name} for o in leads],
                "contacts": [{"id": o.pk, "label": str(o)} for o in contacts],
                "companies": [{"id": o.pk, "label": o.name} for o in companies],
                "deals": [{"id": o.pk, "label": o.title} for o in deals],
            }
        )
