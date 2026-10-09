import logging
import mimetypes
import re
import uuid

from django.conf import settings
from django.core import signing
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import HttpResponseRedirect
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.contacts.models import Contact
from apps.core.permissions import is_privileged, scope
from apps.deals.models import Deal
from apps.leads.models import Lead

from . import storage
from .models import Attachment
from .serializers import (
    PARENTS,
    AttachmentSerializer,
    ConfirmUploadSerializer,
    UploadRequestSerializer,
)

logger = logging.getLogger(__name__)
TOKEN_SALT = "attachments.upload"
TOKEN_MAX_AGE = 3600
PARENT_MODELS = {"lead": Lead, "deal": Deal, "contact": Contact}
INLINE_TYPES = {
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
}


class StorageUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "File storage is not configured."


class StorageError(APIException):
    status_code = status.HTTP_502_BAD_GATEWAY
    default_detail = "File storage is unavailable right now. Please try again."


def _storage(call, *args, **kwargs):
    try:
        return call(*args, **kwargs)
    except storage.StorageNotConfigured as e:
        raise StorageUnavailable from e
    except Exception as e:  # network / credentials / S3 errors
        logger.exception("S3 call %s failed", getattr(call, "__name__", call))
        raise StorageError from e


class IsUploaderOrPrivileged(IsAuthenticated):
    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return obj.uploaded_by_id == request.user.pk or is_privileged(request.user)


class AttachmentViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Upload flow: POST upload-url → browser POSTs the file to S3 → POST /attachments/ {token}."""

    queryset = Attachment.objects.select_related("uploaded_by")
    serializer_class = AttachmentSerializer
    permission_classes = [IsUploaderOrPrivileged]
    filterset_fields = ["lead", "deal", "contact"]

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if is_privileged(user):
            return qs
        return qs.filter(Q(lead__owner=user) | Q(deal__owner=user) | Q(contact__owner=user))

    @extend_schema(request=UploadRequestSerializer, responses={200: dict})
    @action(detail=False, methods=["post"], url_path="upload-url")
    def upload_url(self, request):
        s = UploadRequestSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        data = s.validated_data
        parent_field = next(p for p in PARENTS if data.get(p))
        filename = data["filename"].strip().replace("/", "_").replace("\\", "_")
        content_type = (
            data.get("content_type")
            or mimetypes.guess_type(filename)[0]
            or "application/octet-stream"
        )
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename)[-100:] or "file"
        key = f"attachments/{parent_field}/{data[parent_field].pk}/{uuid.uuid4().hex}/{safe}"
        upload = _storage(
            storage.presigned_upload, key, content_type, settings.ATTACHMENT_MAX_BYTES
        )
        token = signing.dumps(
            {
                "key": key,
                "filename": filename,
                "content_type": content_type,
                "parent": [parent_field, data[parent_field].pk],
                "user": request.user.pk,
            },
            salt=TOKEN_SALT,
        )
        return Response({"upload": upload, "token": token})

    @extend_schema(request=ConfirmUploadSerializer, responses={201: AttachmentSerializer})
    def create(self, request):
        """Record an upload once S3 has it. The signed token stops clients from registering
        keys (other people's files) they weren't issued."""
        s = ConfirmUploadSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            claim = signing.loads(s.validated_data["token"], salt=TOKEN_SALT, max_age=TOKEN_MAX_AGE)
        except signing.BadSignature as e:
            raise ValidationError(
                {"token": ["This upload has expired. Please upload the file again."]}
            ) from e
        if claim["user"] != request.user.pk:
            raise ValidationError({"token": ["This upload belongs to someone else."]})
        parent_field, parent_id = claim["parent"]
        parent = (
            scope(PARENT_MODELS[parent_field].objects.all(), request.user)
            .filter(pk=parent_id)
            .first()
        )
        if parent is None:
            raise ValidationError({parent_field: ["Not found or not permitted."]})
        info = _storage(storage.object_info, claim["key"])
        if info is None:
            raise ValidationError(
                {"token": ["The file didn't reach storage. Please upload it again."]}
            )
        try:
            # Savepoint: a duplicate key must not poison the surrounding transaction.
            with transaction.atomic():
                attachment = Attachment.objects.create(
                    s3_key=claim["key"],
                    filename=claim["filename"],
                    size=info.get("ContentLength", 0),
                    content_type=claim["content_type"],
                    uploaded_by=request.user,
                    **{parent_field: parent},
                )
        except IntegrityError as e:
            raise ValidationError({"token": ["This file has already been saved."]}) from e
        return Response(AttachmentSerializer(attachment).data, status=status.HTTP_201_CREATED)

    @extend_schema(
        parameters=[
            OpenApiParameter("inline", bool, description="Open in the browser if possible")
        ],
        responses={302: None},
    )
    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        attachment = self.get_object()
        inline = request.query_params.get("inline") in ("1", "true") and (
            attachment.content_type in INLINE_TYPES
        )
        url = _storage(storage.presigned_download, attachment.s3_key, attachment.filename, inline)
        return HttpResponseRedirect(url)

    def perform_destroy(self, instance):
        _storage(storage.delete_object, instance.s3_key)
        instance.delete()
