import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.activities.models import Activity
from apps.contacts.models import Company, Contact
from apps.deals.models import Deal, PipelineStage
from apps.leads.models import Lead, LeadSource, Tag
from apps.tasks.models import Task

DEMO_PASSWORD = "demo12345"
SOURCES = ["Website", "Referral", "Ads", "Cold Call", "Event"]
TAGS = [("Hot", "#ef4444"), ("VIP", "#8b5cf6"), ("Follow-up", "#f59e0b"), ("Enterprise", "#0ea5e9")]
STAGES = [
    ("Prospecting", False, False),
    ("Proposal", False, False),
    ("Negotiation", False, False),
    ("Won", True, False),
    ("Lost", False, True),
]


class Command(BaseCommand):
    help = "Populate the database with demo users and fake CRM data."

    def add_arguments(self, parser):
        parser.add_argument("--leads", type=int, default=200)
        parser.add_argument("--reset", action="store_true", help="Delete existing CRM data first")

    @transaction.atomic
    def handle(self, *args, leads, reset, **opts):
        try:
            from faker import Faker
        except ImportError as e:
            raise CommandError("Faker is required: pip install -r requirements-dev.txt") from e
        fake = Faker()
        Faker.seed(42)
        random.seed(42)

        if reset:
            for model in (Activity, Task, Deal, Lead, Contact, Company):
                model.objects.all().delete()

        self._user("admin", User.Role.ADMIN, "Ada", "Admin", superuser=True)
        manager = self._user("manager", User.Role.MANAGER, "Max", "Manager")
        reps = [
            self._user(f"rep{i}", User.Role.REP, fake.first_name(), fake.last_name())
            for i in range(1, 4)
        ]
        sales = [manager, *reps]

        sources = [LeadSource.objects.get_or_create(name=n)[0] for n in SOURCES]
        tags = [Tag.objects.get_or_create(name=n, defaults={"color": c})[0] for n, c in TAGS]
        stages = []
        for i, (name, won, lost) in enumerate(STAGES):
            stage, _ = PipelineStage.objects.get_or_create(
                name=name, defaults={"order": i, "is_won": won, "is_lost": lost}
            )
            stages.append(stage)

        companies = Company.objects.bulk_create(
            Company(
                name=fake.unique.company(),
                website=fake.url(),
                industry=random.choice(["SaaS", "Retail", "Finance", "Health", "Manufacturing"]),
                phone=fake.phone_number()[:30],
                address=fake.address(),
                owner=random.choice(sales),
            )
            for _ in range(30)
        )
        contacts = Contact.objects.bulk_create(
            Contact(
                first_name=fake.first_name(),
                last_name=fake.last_name(),
                email=fake.email(),
                phone=fake.phone_number()[:30],
                job_title=fake.job()[:100],
                company=random.choice(companies),
                owner=random.choice(sales),
            )
            for _ in range(80)
        )

        now = timezone.now()
        lead_objs = Lead.objects.bulk_create(
            Lead(
                name=fake.name(),
                email=fake.email(),
                phone=fake.phone_number()[:30],
                company_name=fake.company(),
                source=random.choice(sources),
                status=random.choices(
                    [s for s, _ in Lead.Status.choices], weights=[30, 25, 20, 15, 10]
                )[0],
                estimated_value=Decimal(random.randint(5, 500) * 100),
                owner=random.choice(reps),
                notes=fake.sentence(),
            )
            for _ in range(leads)
        )
        # Spread created_at over the last 6 months so dashboards have history.
        for lead in lead_objs:
            lead.created_at = now - timedelta(days=random.randint(0, 180))
            if lead.status == Lead.Status.CONVERTED:
                lead.converted_at = min(
                    now, lead.created_at + timedelta(days=random.randint(1, 30))
                )
            lead.tags.set(random.sample(tags, k=random.randint(0, 2)))
        Lead.objects.bulk_update(lead_objs, ["created_at", "converted_at"])

        deals = []
        for _ in range(60):
            stage = random.choice(stages)
            contact = random.choice(contacts)
            deals.append(
                Deal(
                    title=f"{contact.company.name if contact.company else 'Deal'} - "
                    f"{fake.bs().title()}"[:200],
                    value=Decimal(random.randint(10, 1000) * 100),
                    stage=stage,
                    contact=contact,
                    company=contact.company,
                    owner=random.choice(reps),
                    expected_close_date=(now + timedelta(days=random.randint(-30, 90))).date(),
                    closed_at=now - timedelta(days=random.randint(0, 60))
                    if stage.is_won or stage.is_lost
                    else None,
                )
            )
        deals = Deal.objects.bulk_create(deals)

        Activity.objects.bulk_create(
            Activity(
                type=random.choice([t for t, _ in Activity.Type.choices]),
                subject=fake.sentence(nb_words=5),
                body=fake.paragraph(),
                occurred_at=now - timedelta(days=random.randint(0, 60)),
                user=lead.owner,
                lead=lead,
            )
            for lead in random.sample(lead_objs, k=min(100, len(lead_objs)))
        )
        Task.objects.bulk_create(
            Task(
                title=fake.sentence(nb_words=4),
                due_at=now + timedelta(hours=random.randint(-72, 240)),
                assigned_to=deal.owner,
                created_by=manager,
                deal=deal,
            )
            for deal in deals[:40]
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Seeded {len(lead_objs)} leads, {len(deals)} deals, {len(contacts)} contacts. "
                f"Logins: admin / manager / rep1..rep3, password '{DEMO_PASSWORD}'"
            )
        )

    def _user(self, username, role, first, last, superuser=False):
        user, created = User.objects.get_or_create(
            username=username,
            defaults={
                "role": role,
                "first_name": first,
                "last_name": last,
                "email": f"{username}@example.com",
                "is_staff": superuser,
                "is_superuser": superuser,
            },
        )
        if created:
            user.set_password(DEMO_PASSWORD)
            user.save()
        return user
