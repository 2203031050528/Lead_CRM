from django.db import transaction
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.audit.utils import log, snapshot
from apps.contacts.models import Company, Contact
from apps.core.permissions import scope
from apps.deals.models import Deal, PipelineStage

from .models import Lead


class ConversionError(Exception):
    pass


@transaction.atomic
def convert_lead(
    lead: Lead,
    actor,
    *,
    create_deal=True,
    deal_title="",
    deal_value=None,
    stage=None,
    expected_close_date=None,
) -> dict:
    """Create a Contact (+ Company if needed, + Deal) from a lead and mark it Converted."""
    lead = Lead.objects.select_for_update().get(pk=lead.pk)
    if lead.status == Lead.Status.CONVERTED:
        raise ConversionError("This lead is already converted.")

    company = None
    if lead.company_name:
        # Reuse a company the actor can see; otherwise create one.
        company = (
            scope(Company.objects.all(), actor)
            .filter(name__iexact=lead.company_name.strip())
            .first()
        )
        if company is None:
            company = Company.objects.create(name=lead.company_name.strip(), owner=lead.owner)
            log(actor, AuditLog.Action.CREATE, company, snapshot(company))

    first, _, last = lead.name.strip().partition(" ")
    contact = Contact.objects.create(
        first_name=first or lead.name,
        last_name=last,
        email=lead.email,
        phone=lead.phone,
        company=company,
        owner=lead.owner,
    )
    log(actor, AuditLog.Action.CREATE, contact, snapshot(contact))

    deal = None
    if create_deal:
        stage = stage or PipelineStage.objects.filter(is_won=False, is_lost=False).first()
        if stage is None:
            raise ConversionError("No open pipeline stage exists. Create one first.")
        deal = Deal.objects.create(
            title=deal_title or f"{company.name if company else lead.name} deal",
            value=lead.estimated_value if deal_value is None else deal_value,
            stage=stage,
            contact=contact,
            company=company,
            lead=lead,
            owner=lead.owner,
            expected_close_date=expected_close_date,
            closed_at=timezone.now() if stage.is_won or stage.is_lost else None,
        )
        log(actor, AuditLog.Action.CREATE, deal, snapshot(deal))

    before = lead.status
    lead.status = Lead.Status.CONVERTED
    lead.converted_contact = contact
    lead.converted_at = timezone.now()
    lead.save(update_fields=["status", "converted_contact", "converted_at", "updated_at"])
    log(
        actor,
        AuditLog.Action.UPDATE,
        lead,
        {
            "status": [before, lead.status],
            "converted_contact_id": [None, contact.pk],
        },
    )
    return {
        "contact": contact.pk,
        "company": company.pk if company else None,
        "deal": deal.pk if deal else None,
    }
