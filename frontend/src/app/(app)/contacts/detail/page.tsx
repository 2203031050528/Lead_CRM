"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { ContactFormModal } from "@/components/contacts/ContactFormModal";
import { DetailState } from "@/components/data/DetailState";
import { DetailList } from "@/components/data/Phase";
import { RelatedDeals } from "@/components/data/RelatedDeals";
import { Button, Card, ConfirmDialog } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useDeleteRecord } from "@/hooks/useDeleteRecord";
import { useIdParam } from "@/hooks/useListParams";
import { get } from "@/lib/api/client";
import type { Contact } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export default function ContactDetailPage() {
  const id = useIdParam();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteRecord("contacts", "Contact", "/contacts");
  const { data: contact, isLoading, error } = useQuery({
    queryKey: ["contacts", "detail", id],
    queryFn: () => get<Contact>(`/contacts/${id}/`),
    enabled: id !== null,
  });

  if (!contact) return <DetailState loading={isLoading && id !== null} error={error} backHref="/contacts" backLabel="Back to contacts" />;

  return (
    <>
      <Link href="/contacts" className="text-sm text-slate-500 hover:text-slate-700">← Contacts</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{contact.full_name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[contact.job_title, contact.company_name].filter(Boolean).join(" at ") || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          {canManage(me?.role) && <Button variant="danger" onClick={() => setDeleting(true)}>Delete</Button>}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Details</h2>
          <DetailList
            items={[
              ["Email", contact.email && <a href={`mailto:${contact.email}`} className="text-indigo-600 hover:underline">{contact.email}</a>],
              ["Phone", contact.phone && <a href={`tel:${contact.phone}`} className="text-indigo-600 hover:underline">{contact.phone}</a>],
              ["Company", contact.company && <Link href={`/companies/detail?id=${contact.company}`} className="text-indigo-600 hover:underline">{contact.company_name}</Link>],
              ["Owner", contact.owner_name],
              ["Created", formatDate(contact.created_at, true)],
            ]}
          />
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <RelatedDeals filter={{ contact: contact.id }} />
          <ActivityTimeline parent={{ field: "contact", id: contact.id }} />
          <AttachmentsPanel parent={{ field: "contact", id: contact.id }} />
        </div>
      </div>
      <ContactFormModal open={editing} onClose={() => setEditing(false)} contact={contact} />
      <ConfirmDialog
        open={deleting}
        title="Delete contact?"
        message={<>This permanently deletes <strong>{contact.full_name}</strong>. Linked deals are kept but lose this contact.</>}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(contact.id)}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
