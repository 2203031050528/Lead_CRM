"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ContactFormModal } from "@/components/contacts/ContactFormModal";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/data/DataTable";
import { ExportButton } from "@/components/data/ExportButton";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useListParams, useResetInvalidPage } from "@/hooks/useListParams";
import { get } from "@/lib/api/client";
import type { Contact, Paginated } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const KEYS = ["search", "owner", "company", "ordering"] as const;

export default function ContactsPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { params, page, set, clear, active } = useListParams(KEYS);
  const [creating, setCreating] = useState(false);
  const query = { ...params, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["contacts", "list", query],
    queryFn: () => get<Paginated<Contact>>("/contacts/", query),
    placeholderData: keepPreviousData,
  });
  useResetInvalidPage(error, page, set);

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Name",
      sort: "first_name",
      render: (c) => (
        <div>
          <span className="font-medium text-slate-900">{c.full_name}</span>
          <p className="text-xs text-slate-500">{c.job_title || "—"}</p>
        </div>
      ),
    },
    { key: "email", header: "Email", sort: "email", render: (c) => c.email || "—", className: "hidden md:table-cell" },
    { key: "phone", header: "Phone", render: (c) => c.phone || "—", className: "hidden lg:table-cell" },
    {
      key: "company",
      header: "Company",
      render: (c) =>
        c.company ? (
          <Link href={`/companies/detail?id=${c.company}`} onClick={(e) => e.stopPropagation()} className="hover:text-indigo-600">
            {c.company_name}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "owner", header: "Owner", render: (c) => c.owner_name, className: "hidden md:table-cell" },
    { key: "created", header: "Created", sort: "created_at", render: (c) => formatDate(c.created_at), className: "hidden sm:table-cell whitespace-nowrap" },
  ];

  return (
    <>
      <PageHeader
        title="Contacts"
        description={data ? `${data.count} contact${data.count === 1 ? "" : "s"}` : undefined}
        actions={
          <>
            <ExportButton resource="contacts" query={query} />
            <Button onClick={() => setCreating(true)}>New contact</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search name, email, phone, company" />
        {canManage(me?.role) && (
          <OwnerSelect aria-label="Owner" emptyLabel="All owners" value={params.owner} onChange={(e) => set({ owner: e.target.value })} className="w-auto" />
        )}
        {active && <Button variant="ghost" onClick={clear}>Clear filters</Button>}
      </div>
      <DataTable
        rows={data?.results}
        columns={columns}
        loading={isLoading}
        ordering={params.ordering}
        onSort={(o) => set({ ordering: o })}
        onRowClick={(c) => router.push(`/contacts/detail?id=${c.id}`)}
        empty={
          active ? (
            <EmptyState title="No contacts match" action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No contacts yet" description="Contacts are created here or when you convert a lead." action={<Button onClick={() => setCreating(true)}>New contact</Button>} />
          )
        }
      />
      {data && <Pagination page={page} count={data.count} onPage={(p) => set({ page: p })} />}
      <ContactFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => router.push(`/contacts/detail?id=${c.id}`)} />
    </>
  );
}
