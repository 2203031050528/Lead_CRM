from django.contrib.auth.models import AbstractUser
from django.contrib.auth.models import UserManager as DjangoUserManager
from django.db import models


class UserManager(DjangoUserManager):
    def create_superuser(self, username, email=None, password=None, **extra_fields):
        # `manage.py createsuperuser` should produce someone the UI also shows as Admin.
        extra_fields.setdefault("role", User.Role.ADMIN)
        return super().create_superuser(username, email, password, **extra_fields)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        MANAGER = "manager", "Manager"
        REP = "rep", "Sales Rep"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.REP, db_index=True)
    phone = models.CharField(max_length=30, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    class Meta:
        ordering = ["username"]

    def __str__(self):
        return self.get_full_name() or self.username

    @property
    def is_admin_role(self) -> bool:
        return self.role == self.Role.ADMIN or self.is_superuser

    @property
    def is_manager_or_admin(self) -> bool:
        return self.is_admin_role or self.role == self.Role.MANAGER
