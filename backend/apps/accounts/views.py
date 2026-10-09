from django.conf import settings
from django.contrib.auth import authenticate, login, logout, password_validation
from django.contrib.auth.tokens import default_token_generator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.utils.decorators import method_decorator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.core.permissions import IsAdminRole

from .models import User
from .serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    UserSerializer,
)


class AuthThrottle(AnonRateThrottle):
    rate = "20/min"


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """GET sets the csrftoken cookie so the SPA can send X-CSRFToken."""

    permission_classes = [AllowAny]

    @extend_schema(responses={204: None})
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(csrf_protect, name="post")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(request=LoginSerializer, responses=UserSerializer)
    def post(self, request):
        s = LoginSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        user = authenticate(request, **s.validated_data)
        if user is None:
            raise ValidationError({"detail": "Invalid username or password."})
        login(request, user)
        return Response(UserSerializer(user).data)


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    @extend_schema(request=ChangePasswordSerializer, responses={204: None})
    def post(self, request):
        s = ChangePasswordSerializer(data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        request.user.set_password(s.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        login(request, request.user)  # keep the session valid after the hash changes
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetRequestView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(request=PasswordResetRequestSerializer, responses={204: None})
    def post(self, request):
        s = PasswordResetRequestSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        # Always 204 so the endpoint does not reveal which emails exist.
        for user in User.objects.filter(email__iexact=s.validated_data["email"], is_active=True):
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
            send_mail(
                "Reset your CRM password",
                f"Use this link to set a new password:\n\n{link}\n\n"
                "If you did not request this, ignore this email.",
                None,
                [user.email],
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthThrottle]

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        s = PasswordResetConfirmSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        try:
            pk = force_str(urlsafe_base64_decode(s.validated_data["uid"]))
            user = User.objects.get(pk=pk, is_active=True)
        except (ValueError, TypeError, OverflowError, User.DoesNotExist):
            user = None
        if user is None or not default_token_generator.check_token(user, s.validated_data["token"]):
            raise ValidationError({"token": ["Reset link is invalid or has expired."]})
        try:
            password_validation.validate_password(s.validated_data["new_password"], user)
        except DjangoValidationError as e:
            raise ValidationError({"new_password": list(e.messages)}) from e
        user.set_password(s.validated_data["new_password"])
        user.save(update_fields=["password"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Everyone can list users (for assignment pickers); only admins manage them.
    DELETE deactivates instead of deleting, so history stays intact."""

    queryset = User.objects.all()
    serializer_class = UserSerializer
    filterset_fields = ["role", "is_active"]
    search_fields = ["username", "first_name", "last_name", "email"]
    ordering_fields = ["username", "first_name", "created_at", "role"]

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return [IsAuthenticated()]
        return [IsAdminRole()]

    def perform_update(self, serializer):
        if serializer.instance == self.request.user:
            data = serializer.validated_data
            if "role" in data and data["role"] != serializer.instance.role:
                raise ValidationError({"role": ["You can't change your own role."]})
            if data.get("is_active") is False:
                raise ValidationError({"is_active": ["You can't deactivate yourself."]})
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError({"detail": "You cannot deactivate yourself."})
        instance.is_active = False
        instance.save(update_fields=["is_active"])
