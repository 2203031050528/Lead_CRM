from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import UserViewSet
from apps.activities.views import ActivityViewSet
from apps.attachments.views import AttachmentViewSet
from apps.audit.views import AuditLogViewSet
from apps.contacts.views import CompanyViewSet, ContactViewSet
from apps.core.health import HealthView
from apps.core.search import GlobalSearchView
from apps.deals.views import DealViewSet, PipelineStageViewSet
from apps.leads.views import LeadSourceViewSet, LeadViewSet, TagViewSet
from apps.notifications.views import NotificationViewSet
from apps.reports.views import DashboardView, PerformanceView
from apps.tasks.views import TaskViewSet

router = DefaultRouter()
router.register("users", UserViewSet)
router.register("leads", LeadViewSet)
router.register("lead-sources", LeadSourceViewSet)
router.register("tags", TagViewSet)
router.register("companies", CompanyViewSet)
router.register("contacts", ContactViewSet)
router.register("stages", PipelineStageViewSet)
router.register("deals", DealViewSet)
router.register("activities", ActivityViewSet)
router.register("tasks", TaskViewSet)
router.register("notifications", NotificationViewSet, basename="notification")
router.register("audit-logs", AuditLogViewSet)
router.register("attachments", AttachmentViewSet)

urlpatterns = [
    path("", include("apps.accounts.urls")),
    path("health/", HealthView.as_view()),
    path("search/", GlobalSearchView.as_view()),
    path("reports/dashboard/", DashboardView.as_view()),
    path("reports/performance/", PerformanceView.as_view()),
    path("", include(router.urls)),
]
