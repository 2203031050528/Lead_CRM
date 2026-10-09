from .base import *  # noqa: F401,F403
from .base import env

# Tests never use DATABASE_URL, so a .env pointing at a shared/cloud database
# (e.g. Neon) is never touched. Django creates and drops test_<name> itself.
DATABASES = {
    "default": env.db("TEST_DATABASE_URL", default="postgres://crm:crm@localhost:5432/crm")
}
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
