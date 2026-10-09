"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CompanyFormModal } from "@/components/companies/CompanyFormModal";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/data/DataTable";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useListParams, useResetInvalidPage } from "@/hooks/useListParams";
import { get } from "@/lib/api/client";
import type { Company, Paginated } from "@/lib/api/types";

const KEYS = ["search", "owner", "ordering"] as const;

export default function CompaniesPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const { params, page, set, clear, active } = useListParams(KEYS);
  const [creating, setCreating] = useState(false);
  const query = { ...params, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["companies", "list", query],
    queryFn: () => get<Paginated<Company>>("/companies/", query),
    placeholderData: keepPreviousData,
  });
  useResetInvalidPage(error, page, set);

  const columns: Column<Company>[] = [
    {
      key: "name",
      header: "Name",
      sort: "name",
      render: (c) => (
        <div>
          <span className="font-medium text-slate-900">{c.name}</span>
          {c.website && <p className="truncate text-xs text-slate-500">{c.website.replace(/^https?:\/\//, "")}</p>}
        </div>
      ),
    },
    { key: "industry", header: "Industry", sort: "industry", render: (c) => c.industry || "—", className: "hidden sm:table-cell" },
    { key: "contacts", header: "Contacts", render: (c) => c.contact_count ?? 0, className: "text-right" },
    { key: "deals", header: "Deals", render: (c) => c.deal_count ?? 0, className: "text-right" },
    { key: "owner", header: "Owner", render: (c) => c.owner_name, className: "hidden md:table-cell" },
  ];

  return (
    <>
      <PageHeader
        title="Companies"
        description={data ? `${data.count} compan${data.count === 1 ? "y" : "ies"}` : undefined}
        actions={<Button onClick={() => setCreating(true)}>New company</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search name, website, industry" />
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
        onRowClick={(c) => router.push(`/companies/detail?id=${c.id}`)}
        empty={
          active ? (
            <EmptyState title="No companies match" action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No companies yet" action={<Button onClick={() => setCreating(true)}>New company</Button>} />
          )
        }
      />
      {data && <Pagination page={page} count={data.count} onPage={(p) => set({ page: p })} />}
      <CompanyFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => router.push(`/companies/detail?id=${c.id}`)} />
    </>
  );
}
