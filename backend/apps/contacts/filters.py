import django_filters

from .models import Company, Contact


class CompanyFilter(django_filters.FilterSet):
    class Meta:
        model = Company
        fields = ["owner", "industry"]


class ContactFilter(django_filters.FilterSet):
    class Meta:
        model = Contact
        fields = ["owner", "company"]
