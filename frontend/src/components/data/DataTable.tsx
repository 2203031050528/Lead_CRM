"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button, cx, EmptyState, Input, Skeleton } from "@/components/ui";

export interface Column<T> {
  key: string;
  header: string;
  /** API ordering field; makes the header clickable. */
  sort?: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T extends { id: number }> {
  rows: T[] | undefined;
  columns: Column<T>[];
  loading?: boolean;
  ordering?: string;
  onSort?: (ordering: string) => void;
  onRowClick?: (row: T) => void;
  selected?: Set<number>;
  onSelectedChange?: (s: Set<number>) => void;
  empty?: ReactNode;
}

export function DataTable<T extends { id: number }>({
  rows,
  columns,
  loading,
  ordering = "",
  onSort,
  onRowClick,
  selected,
  onSelectedChange,
  empty,
}: Props<T>) {
  const selectable = !!selected && !!onSelectedChange;
  const allSelected = !!rows?.length && rows.every((r) => selected?.has(r.id));

  const toggleAll = () => {
    if (!rows || !onSelectedChange) return;
    onSelectedChange(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  };
  const toggle = (id: number) => {
    if (!selected || !onSelectedChange) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };

  if (!loading && rows && rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            {selectable && (
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" aria-label="Select all" checked={allSelected} onChange={toggleAll} className="rounded" />
              </th>
            )}
            {columns.map((c) => {
              const dir = ordering === c.sort ? "asc" : ordering === `-${c.sort}` ? "desc" : null;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cx("whitespace-nowrap px-3 py-2.5 text-left font-medium text-slate-600", c.className)}
                  aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                >
                  {c.sort && onSort ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-slate-900"
                      onClick={() => onSort(dir === "asc" ? `-${c.sort}` : dir === "desc" ? "" : c.sort!)}
                    >
                      {c.header}
                      <span className="text-xs text-slate-400">{dir === "asc" ? "▲" : dir === "desc" ? "▼" : "↕"}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {selectable && <td className="px-3 py-3" />}
                  {columns.map((c) => (
                    <td key={c.key} className="px-3 py-3">
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cx(onRowClick && "cursor-pointer hover:bg-slate-50", selected?.has(row.id) && "bg-indigo-50/40")}
                >
                  {selectable && (
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label="Select row"
                        checked={selected!.has(row.id)}
                        onChange={() => toggle(row.id)}
                        className="rounded"
                      />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cx("px-3 py-2.5 text-slate-700", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  count,
  pageSize = 25,
  onPage,
}: {
  page: number;
  count: number;
  pageSize?: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / pageSize));
  if (count === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
      <span>
        {from}–{to} of {count}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="hidden sm:inline">
          Page {page} of {pages}
        </span>
        <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/** Text input that reports changes after the user stops typing. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onChange]);
  return (
    <Input
      type="search"
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="sm:w-64"
    />
  );
}
