"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { CompanyFormModal } from "@/components/companies/CompanyFormModal";
import { ContactFormModal } from "@/components/contacts/ContactFormModal";
import { DetailState } from "@/components/data/DetailState";
import { DetailList } from "@/components/data/Phase";
import { RelatedDeals } from "@/components/data/RelatedDeals";
import { Button, Card, ConfirmDialog, Skeleton } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useDeleteRecord } from "@/hooks/useDeleteRecord";
import { useIdParam } from "@/hooks/useListParams";
import { get } from "@/lib/api/client";
import type { Company, Contact, Paginated } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export default function CompanyDetailPage() {
  const id = useIdParam();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [addingContact, setAddingContact] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteRecord("companies", "Company", "/companies");

  const { data: company, isLoading, error } = useQuery({
    queryKey: ["companies", "detail", id],
    queryFn: () => get<Company>(`/companies/${id}/`),
    enabled: id !== null,
  });
  const contacts = useQuery({
    queryKey: ["contacts", "list", { company: id, page_size: 100 }],
    queryFn: () => get<Paginated<Contact>>("/contacts/", { company: id!, page_size: 100 }),
    enabled: !!company,
  });

  if (!company) return <DetailState loading={isLoading && id !== null} error={error} backHref="/companies" backLabel="Back to companies" />;

  return (
    <>
      <Link href="/companies" className="text-sm text-slate-500 hover:text-slate-700">← Companies</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{company.industry || "—"}</p>
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
              ["Website", company.website && <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">{company.website.replace(/^https?:\/\//, "")}</a>],
              ["Phone", company.phone],
              ["Address", company.address && <span className="whitespace-pre-line">{company.address}</span>],
              ["Owner", company.owner_name],
              ["Created", formatDate(company.created_at, true)],
            ]}
          />
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-900">Contacts{contacts.data ? ` (${contacts.data.count})` : ""}</h2>
              <Button variant="ghost" className="py-1" onClick={() => setAddingContact(true)}>+ Add contact</Button>
            </div>
            {contacts.isLoading ? (
              <div className="space-y-2 p-5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
            ) : !contacts.data?.results.length ? (
              <p className="px-5 py-6 text-sm text-slate-400">No contacts at this company yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {contacts.data.results.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div>
                      <Link href={`/contacts/detail?id=${c.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{c.full_name}</Link>
                      <p className="text-xs text-slate-500">{c.job_title || "—"}</p>
                    </div>
                    <span className="text-slate-500">{c.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <RelatedDeals filter={{ company: company.id }} />
        </div>
      </div>
      <CompanyFormModal open={editing} onClose={() => setEditing(false)} company={company} />
      <ContactFormModal open={addingContact} onClose={() => setAddingContact(false)} company={company} />
      <ConfirmDialog
        open={deleting}
        title="Delete company?"
        message={<>This permanently deletes <strong>{company.name}</strong>. Its contacts and deals are kept but unlinked.</>}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(company.id)}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
