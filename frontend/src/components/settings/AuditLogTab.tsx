"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useCallback } from "react";

import { DataTable, Pagination, SearchInput, type Column } from "@/components/data/DataTable";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Button, cx, EmptyState, Input, Select } from "@/components/ui";
import { useListParams, useResetInvalidPage } from "@/hooks/useListParams";
import { useSources, useStages, useUsers } from "@/hooks/useLookups";
import { get } from "@/lib/api/client";
import type { AuditEntry, Paginated } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const KEYS = ["tab", "model", "action", "actor", "after", "before", "search"] as const;
const MODELS: Record<string, { label: string; href: string }> = {
  lead: { label: "Lead", href: "/leads/detail" },
  deal: { label: "Deal", href: "/deals/detail" },
  contact: { label: "Contact", href: "/contacts/detail" },
  company: { label: "Company", href: "/companies/detail" },
};
const ACTION_STYLE = {
  create: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  update: "bg-sky-50 text-sky-700 ring-sky-600/20",
  delete: "bg-red-50 text-red-700 ring-red-600/20",
};

const fieldName = (key: string) => key.replace(/_id$/, "").replaceAll("_", " ");
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

type Resolve = (key: string, value: unknown) => string;
const USER_KEYS = new Set(["owner_id", "assigned_to_id", "created_by_id", "uploaded_by_id", "user_id"]);

/** Snapshots store foreign keys as ids; show the names we know (users, sources, stages). */
function useResolve(): Resolve {
  const { data: users } = useUsers();
  const { data: sources } = useSources();
  const { data: stages } = useStages();
  return useCallback(
    (key, value) => {
      if (value === null || value === undefined || value === "") return "—";
      const id = Number(value);
      if (USER_KEYS.has(key)) return users?.find((u) => u.id === id)?.full_name ?? `#${id}`;
      if (key === "source_id") return sources?.find((s) => s.id === id)?.name ?? `#${id}`;
      if (key === "stage_id") return stages?.find((s) => s.id === id)?.name ?? `#${id}`;
      return show(value);
    },
    [users, sources, stages],
  );
}

/** Updates store {field: [old, new]}; creates/deletes store a snapshot {field: value}. */
function Changes({ entry, resolve }: { entry: AuditEntry; resolve: Resolve }) {
  const rows = Object.entries(entry.changes).filter(([k]) => k !== "id");
  if (rows.length === 0) return <span className="text-slate-400">—</span>;
  const isDiff = entry.action === "update";
  const summary = isDiff
    ? rows.map(([k]) => fieldName(k)).join(", ")
    : `${rows.length} field${rows.length === 1 ? "" : "s"}`;
  return (
    <details className="group text-xs">
      <summary className="cursor-pointer list-none text-slate-600 marker:hidden hover:text-slate-900">
        <span className="mr-1 inline-block transition-transform group-open:rotate-90">▸</span>
        {summary}
      </summary>
      <dl className="mt-2 space-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[8rem_1fr] gap-2">
            <dt className="truncate text-slate-500">{fieldName(key)}</dt>
            <dd className="break-words text-slate-800">
              {isDiff && Array.isArray(value) ? (
                <>
                  <span className="text-slate-500 line-through">{resolve(key, value[0])}</span> → {resolve(key, value[1])}
                </>
              ) : (
                resolve(key, value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function AuditLogTab() {
  const resolve = useResolve();
  const { params, page, set } = useListParams(KEYS);
  const filters = { model: params.model, action: params.action, actor: params.actor, after: params.after, before: params.before, search: params.search };
  const query = { ...filters, page };
  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", query],
    queryFn: () => get<Paginated<AuditEntry>>("/audit-logs/", query),
    placeholderData: keepPreviousData,
  });
  useResetInvalidPage(error, page, set);
  const active = Object.values(filters).some(Boolean);

  const columns: Column<AuditEntry>[] = [
    { key: "when", header: "When", render: (e) => formatDate(e.timestamp, true), className: "whitespace-nowrap align-top" },
    { key: "who", header: "Who", render: (e) => e.actor_name || "System", className: "align-top" },
    {
      key: "action",
      header: "Action",
      className: "align-top",
      render: (e) => (
        <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset", ACTION_STYLE[e.action])}>
          {e.action}
        </span>
      ),
    },
    {
      key: "record",
      header: "Record",
      className: "align-top",
      render: (e) => {
        const model = MODELS[e.model];
        return (
          <div>
            <span className="text-xs text-slate-500">{model?.label ?? e.model}</span>
            <p>
              {model && e.action !== "delete" ? (
                <Link href={`${model.href}?id=${e.object_id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                  {e.object_repr || `#${e.object_id}`}
                </Link>
              ) : (
                <span className="font-medium text-slate-900">{e.object_repr || `#${e.object_id}`}</span>
              )}
            </p>
          </div>
        );
      },
    },
    { key: "changes", header: "Changes", render: (e) => <Changes entry={e} resolve={resolve} />, className: "min-w-[16rem] align-top" },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchInput value={params.search} onChange={(v) => set({ search: v })} placeholder="Search record name" />
        <Select aria-label="Record type" value={params.model} onChange={(e) => set({ model: e.target.value })} className="w-auto">
          <option value="">All records</option>
          {Object.entries(MODELS).map(([value, m]) => (
            <option key={value} value={value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Action" value={params.action} onChange={(e) => set({ action: e.target.value })} className="w-auto">
          <option value="">All actions</option>
          <option value="create">Created</option>
          <option value="update">Updated</option>
          <option value="delete">Deleted</option>
        </Select>
        <OwnerSelect aria-label="Who" emptyLabel="Anyone" value={params.actor} onChange={(e) => set({ actor: e.target.value })} className="w-auto" />
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <Input type="date" aria-label="From" value={params.after} onChange={(e) => set({ after: e.target.value })} className="w-auto" />
          <span>–</span>
          <Input type="date" aria-label="To" value={params.before} onChange={(e) => set({ before: e.target.value })} className="w-auto" />
        </div>
        {active && (
          <Button variant="ghost" onClick={() => set({ search: "", model: "", action: "", actor: "", after: "", before: "" })}>
            Clear filters
          </Button>
        )}
      </div>
      <DataTable
        rows={data?.results}
        columns={columns}
        loading={isLoading}
        empty={<EmptyState title={active ? "No changes match these filters" : "No changes recorded yet"} />}
      />
      {data && <Pagination page={page} count={data.count} onPage={(p) => set({ page: p })} />}
    </>
  );
}
