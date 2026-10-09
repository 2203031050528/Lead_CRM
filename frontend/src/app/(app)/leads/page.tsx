"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LEAD_STATUSES, StatusBadge, TagChip } from "@/components/data/badges";
import { DataTable, Pagination, SearchInput, type Column } from "@/components/data/DataTable";
import { ExportButton } from "@/components/data/ExportButton";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { LeadFormModal } from "@/components/leads/LeadFormModal";
import { Button, EmptyState, Input, PageHeader, Select, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useListParams, useResetInvalidPage } from "@/hooks/useListParams";
import { useSources, useTags } from "@/hooks/useLookups";
import { ApiError, get, post } from "@/lib/api/client";
import type { Lead, Paginated } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";

const KEYS = ["search", "status", "source", "owner", "tag", "created_after", "created_before", "ordering"] as const;

export default function LeadsPage() {
  const router = useRouter();
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const { params, page, set, clear, active } = useListParams(KEYS);
  const { data: sources } = useSources();
  const { data: tags } = useTags();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const query = { ...params, page };
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["leads", "list", query],
    queryFn: () => get<Paginated<Lead>>("/leads/", query),
    placeholderData: keepPreviousData,
  });
  useResetInvalidPage(error, page, set);
  useEffect(() => setSelected(new Set()), [data]);

  const columns: Column<Lead>[] = [
    {
      key: "name",
      header: "Name",
      sort: "name",
      render: (l) => (
        <div>
          <Link href={`/leads/detail?id=${l.id}`} className="font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
            {l.name}
          </Link>
          <p className="text-xs text-slate-500">{l.email || l.phone || "—"}</p>
        </div>
      ),
    },
    { key: "company", header: "Company", render: (l) => l.company_name || "—", className: "hidden md:table-cell" },
    { key: "status", header: "Status", sort: "status", render: (l) => <StatusBadge status={l.status} /> },
    { key: "source", header: "Source", render: (l) => l.source_name || "—", className: "hidden lg:table-cell" },
    {
      key: "tags",
      header: "Tags",
      className: "hidden xl:table-cell",
      render: (l) => <div className="flex flex-wrap gap-1">{l.tag_details.map((t) => <TagChip key={t.id} tag={t} />)}</div>,
    },
    { key: "value", header: "Value", sort: "estimated_value", render: (l) => formatMoney(l.estimated_value), className: "text-right" },
    { key: "owner", header: "Owner", render: (l) => l.owner_name, className: "hidden md:table-cell" },
    { key: "created", header: "Created", sort: "created_at", render: (l) => formatDate(l.created_at), className: "hidden sm:table-cell whitespace-nowrap" },
  ];

  return (
    <>
      <PageHeader
        title="Leads"
        description={data ? `${data.count} lead${data.count === 1 ? "" : "s"}` : undefined}
        actions={
          <>
            <ExportButton resource="leads" query={query} />
            <Link
              href="/leads/import"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Import
            </Link>
            <Button onClick={() => setCreating(true)}>New lead</Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search name, email, phone, company" />
        <Select aria-label="Status" value={params.status} onChange={(e) => set({ status: e.target.value })} className="w-auto">
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </Select>
        <Select aria-label="Source" value={params.source} onChange={(e) => set({ source: e.target.value })} className="w-auto">
          <option value="">All sources</option>
          {sources?.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        {!!tags?.length && (
          <Select aria-label="Tag" value={params.tag} onChange={(e) => set({ tag: e.target.value })} className="w-auto">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
        )}
        {manager && (
          <OwnerSelect aria-label="Owner" emptyLabel="All owners" value={params.owner} onChange={(e) => set({ owner: e.target.value })} className="w-auto" />
        )}
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <Input type="date" aria-label="Created from" value={params.created_after} onChange={(e) => set({ created_after: e.target.value })} className="w-auto" />
          <span>–</span>
          <Input type="date" aria-label="Created to" value={params.created_before} onChange={(e) => set({ created_before: e.target.value })} className="w-auto" />
        </div>
        {active && (
          <Button variant="ghost" onClick={clear}>Clear filters</Button>
        )}
        {isFetching && !isLoading && <span className="text-xs text-slate-400">Updating…</span>}
      </div>

      {selected.size > 0 && <BulkBar ids={[...selected]} manager={manager} onDone={() => setSelected(new Set())} />}

      <DataTable
        rows={data?.results}
        columns={columns}
        loading={isLoading}
        ordering={params.ordering}
        onSort={(o) => set({ ordering: o })}
        onRowClick={(l) => router.push(`/leads/detail?id=${l.id}`)}
        selected={selected}
        onSelectedChange={setSelected}
        empty={
          active ? (
            <EmptyState title="No leads match these filters" action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No leads yet" description="Create your first lead to get started." action={<Button onClick={() => setCreating(true)}>New lead</Button>} />
          )
        }
      />
      {data && <Pagination page={page} count={data.count} onPage={(p) => set({ page: p })} />}

      <LeadFormModal open={creating} onClose={() => setCreating(false)} onSaved={(l) => router.push(`/leads/detail?id=${l.id}`)} />
    </>
  );
}

function BulkBar({ ids, manager, onDone }: { ids: number[]; manager: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");

  const run = useMutation({
    mutationFn: (a: { kind: "status" | "assign" }) =>
      a.kind === "status"
        ? post<{ updated: number }>("/leads/bulk_status/", { ids, status })
        : post<{ updated: number }>("/leads/bulk_assign/", { ids, owner: Number(owner) }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast(`Updated ${r.updated} lead${r.updated === 1 ? "" : "s"}`);
      setStatus("");
      setOwner("");
      onDone();
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? Object.values(err.errors)[0]?.[0] ?? err.message : "Bulk update failed";
      toast(msg, "error");
    },
  });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm">
      <span className="font-medium text-indigo-900">{ids.length} selected</span>
      <span className="mx-1 h-5 w-px bg-indigo-200" />
      <Select aria-label="New status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto py-1.5">
        <option value="">Set status…</option>
        {LEAD_STATUSES.filter((s) => s.value !== "converted").map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </Select>
      <Button variant="secondary" disabled={!status} loading={run.isPending && run.variables?.kind === "status"} onClick={() => run.mutate({ kind: "status" })}>
        Apply
      </Button>
      {manager && (
        <>
          <OwnerSelect aria-label="Assign to" emptyLabel="Assign to…" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-auto py-1.5" />
          <Button variant="secondary" disabled={!owner} loading={run.isPending && run.variables?.kind === "assign"} onClick={() => run.mutate({ kind: "assign" })}>
            Assign
          </Button>
        </>
      )}
      <Button variant="ghost" className="ml-auto" onClick={onDone}>Clear selection</Button>
    </div>
  );
}
