"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { DataTable, Pagination, SearchInput, type Column } from "@/components/data/DataTable";
import { ExportButton } from "@/components/data/ExportButton";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { DealFormModal } from "@/components/deals/DealFormModal";
import { KanbanBoard, usePipelineSummary } from "@/components/deals/KanbanBoard";
import { StageBadge } from "@/components/deals/stages";
import { Button, EmptyState, Icon, ICONS, PageHeader, Segmented, Select } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useListParams, useResetInvalidPage } from "@/hooks/useListParams";
import { useStages } from "@/hooks/useLookups";
import { get } from "@/lib/api/client";
import type { Deal, Paginated } from "@/lib/api/types";
import { formatDate, formatMoney, localDateString, timeAgo } from "@/lib/format";

const KEYS = ["view", "search", "owner", "stage", "is_open", "ordering"] as const;

export default function DealsPage() {
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const { params, page, set } = useListParams(KEYS);
  const view = params.view === "list" ? "list" : "board";
  const [creating, setCreating] = useState<{ stage?: number } | null>(null);
  const boardFilters = useMemo(() => ({ search: params.search, owner: params.owner }), [params.search, params.owner]);
  const filtersActive = !!(params.search || params.owner || (view === "list" && (params.stage || params.is_open)));
  const clearFilters = () => set({ search: "", owner: "", stage: "", is_open: "" });

  return (
    <>
      <PageHeader
        title="Deals"
        description={view === "board" ? <PipelineTotal filters={boardFilters} /> : undefined}
        actions={
          <>
            <Segmented
              label="View"
              value={view}
              onChange={(v) => set({ view: v === "list" ? "list" : "" })}
              options={[
                { value: "board", label: <><Icon d={ICONS.board} className="h-4 w-4" />Board</> },
                { value: "list", label: <><Icon d={ICONS.list} className="h-4 w-4" />List</> },
              ]}
            />
            <ExportButton
              resource="deals"
              query={view === "list" ? { search: params.search, owner: params.owner, stage: params.stage, is_open: params.is_open, ordering: params.ordering } : boardFilters}
            />
            <Button onClick={() => setCreating({})}>New deal</Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search title, company, contact" />
        {manager && (
          <OwnerSelect aria-label="Owner" emptyLabel="All owners" value={params.owner} onChange={(e) => set({ owner: e.target.value })} className="w-auto" />
        )}
        {view === "list" && <ListFilters stage={params.stage} isOpen={params.is_open} set={set} />}
        {filtersActive && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {view === "board" ? (
        <KanbanBoard filters={boardFilters} onAdd={(stage) => setCreating({ stage: stage.id })} />
      ) : (
        <DealsTable params={params} page={page} set={set} filtersActive={filtersActive} onClear={clearFilters} onCreate={() => setCreating({})} />
      )}

      <DealFormModal open={creating !== null} onClose={() => setCreating(null)} defaultStage={creating?.stage} />
    </>
  );
}

function PipelineTotal({ filters }: { filters: { search: string; owner: string } }) {
  const { data: stages } = useStages();
  const { data } = usePipelineSummary(filters);
  if (!data || !stages) return null;
  const open = new Set(stages.filter((s) => !s.is_won && !s.is_lost).map((s) => s.id));
  const rows = data.filter((r) => open.has(r.stage));
  const count = rows.reduce((n, r) => n + r.count, 0);
  const total = rows.reduce((n, r) => n + Number(r.total), 0);
  return (
    <>
      Open pipeline: <span className="font-medium text-slate-700">{formatMoney(total)}</span> across {count} deal{count === 1 ? "" : "s"}
    </>
  );
}

type SetParams = ReturnType<typeof useListParams<(typeof KEYS)[number]>>["set"];

function ListFilters({ stage, isOpen, set }: { stage: string; isOpen: string; set: SetParams }) {
  const { data: stages } = useStages();
  return (
    <>
      <Select aria-label="Stage" value={stage} onChange={(e) => set({ stage: e.target.value })} className="w-auto">
        <option value="">All stages</option>
        {stages?.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Open or closed" value={isOpen} onChange={(e) => set({ is_open: e.target.value })} className="w-auto">
        <option value="">Open and closed</option>
        <option value="true">Open only</option>
        <option value="false">Won or lost</option>
      </Select>
    </>
  );
}

function DealsTable({
  params,
  page,
  set,
  filtersActive,
  onClear,
  onCreate,
}: {
  params: Record<(typeof KEYS)[number], string>;
  page: number;
  set: SetParams;
  filtersActive: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  const router = useRouter();
  const { search, owner, stage, is_open, ordering } = params;
  const query = { search, owner, stage, is_open, ordering, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["deals", "list", query],
    queryFn: () => get<Paginated<Deal>>("/deals/", query),
    placeholderData: keepPreviousData,
  });
  useResetInvalidPage(error, page, set);
  const today = localDateString();

  const columns: Column<Deal>[] = [
    {
      key: "title",
      header: "Deal",
      sort: "title",
      render: (d) => (
        <div>
          <Link href={`/deals/detail?id=${d.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-indigo-600">
            {d.title}
          </Link>
          <p className="text-xs text-slate-500">{d.company_name || "—"}</p>
        </div>
      ),
    },
    { key: "stage", header: "Stage", render: (d) => <StageBadge stageId={d.stage} name={d.stage_name} /> },
    { key: "value", header: "Value", sort: "value", render: (d) => formatMoney(d.value), className: "text-right" },
    { key: "contact", header: "Contact", render: (d) => d.contact_name || "—", className: "hidden lg:table-cell" },
    { key: "owner", header: "Owner", render: (d) => d.owner_name, className: "hidden md:table-cell" },
    {
      key: "close",
      header: "Expected close",
      sort: "expected_close_date",
      className: "hidden sm:table-cell whitespace-nowrap",
      render: (d) => (
        <span className={d.expected_close_date && !d.closed_at && d.expected_close_date < today ? "font-medium text-red-600" : undefined}>
          {formatDate(d.expected_close_date)}
        </span>
      ),
    },
    { key: "updated", header: "Updated", sort: "updated_at", render: (d) => timeAgo(d.updated_at), className: "hidden xl:table-cell whitespace-nowrap" },
  ];

  return (
    <>
      <DataTable
        rows={data?.results}
        columns={columns}
        loading={isLoading}
        ordering={params.ordering}
        onSort={(o) => set({ ordering: o })}
        onRowClick={(d) => router.push(`/deals/detail?id=${d.id}`)}
        empty={
          filtersActive ? (
            <EmptyState title="No deals match these filters" action={<Button variant="secondary" onClick={onClear}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No deals yet" description="Create a deal or convert a lead." action={<Button onClick={onCreate}>New deal</Button>} />
          )
        }
      />
      {data && <Pagination page={page} count={data.count} onPage={(p) => set({ page: p })} />}
    </>
  );
}
