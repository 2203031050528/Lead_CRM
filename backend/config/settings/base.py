from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
# Real environment variables win. On servers the file lives outside the deploy directory
# (DJANGO_ENV_FILE=/etc/crm/crm.env) so a deploy can never overwrite or delete it.
environ.Env.read_env(env("DJANGO_ENV_FILE", default=str(BASE_DIR / ".env")), overwrite=False)

SECRET_KEY = env("SECRET_KEY", default="insecure-dev-key")
DEBUG = False
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=[])
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3000")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
    "apps.contacts",
    "apps.leads",
    "apps.deals",
    "apps.activities",
    "apps.tasks",
    "apps.notifications",
    "apps.attachments",
    "apps.audit",
    "apps.reports",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {"default": env.db("DATABASE_URL", default="postgres://crm:crm@localhost:5432/crm")}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("CONN_MAX_AGE", default=60)

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = env("TIME_ZONE", default="UTC")
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
# On servers this lives outside the deploy directory (rsync --delete would wipe it).
STATIC_ROOT = env("STATIC_ROOT", default=str(BASE_DIR / "staticfiles"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.SearchFilter",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 25,
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "EXCEPTION_HANDLER": "apps.core.exceptions.exception_handler",
}

SPECTACULAR_SETTINGS = {"TITLE": "Lead CRM API", "VERSION": "1.0.0"}

SESSION_COOKIE_AGE = 60 * 60 * 24 * 14
CSRF_COOKIE_HTTPONLY = False  # frontend reads it to send X-CSRFToken

EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
EMAIL_HOST = env("EMAIL_HOST", default="localhost")
EMAIL_PORT = env.int("EMAIL_PORT", default=587)
EMAIL_HOST_USER = env("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = env.bool("EMAIL_USE_TLS", default=True)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="CRM <no-reply@example.com>")

AWS_REGION = env("AWS_REGION", default="us-east-1")
AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME", default="")
AWS_BACKUP_BUCKET_NAME = env("AWS_BACKUP_BUCKET_NAME", default="")
# Optional: S3-compatible endpoint for local development (e.g. MinIO at http://localhost:9000).
AWS_S3_ENDPOINT_URL = env("AWS_S3_ENDPOINT_URL", default="")
AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID", default="") or None
AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY", default="") or None
ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

# Backups (manage.py backup_db). pg_dump must be the server's major version or newer.
PG_DUMP_PATH = env("PG_DUMP_PATH", default="pg_dump")
BACKUP_PREFIX = env("BACKUP_PREFIX", default="backups")
