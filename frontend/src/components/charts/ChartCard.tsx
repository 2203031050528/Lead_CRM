"use client";

import { useState, type ReactNode } from "react";

import { Card, cx } from "@/components/ui";

/** Card that owns a chart's title and its table-view twin (the accessible equivalent). */
export function ChartCard({
  title,
  description,
  table,
  fetching,
  action,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  table?: ReactNode;
  /** Refetching: keep the previous render, dimmed, instead of flashing a skeleton. */
  fetching?: boolean;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cx("flex flex-col", className)}>
      <figure className="flex flex-1 flex-col">
        <div className="mb-3 flex items-start justify-between gap-3">
          <figcaption>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </figcaption>
          <div className="flex shrink-0 items-center gap-3">
            {action}
            {table && (
              <button
                type="button"
                onClick={() => setAsTable((t) => !t)}
                aria-pressed={asTable}
                className="text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                {asTable ? "View chart" : "View table"}
              </button>
            )}
          </div>
        </div>
        <div className={cx("flex-1 transition-opacity", fetching && "opacity-60")}>{asTable && table ? table : children}</div>
      </figure>
    </Card>
  );
}

export function DataTableView({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
          {columns.map((c, i) => (
            <th key={c} scope="col" className={cx("py-1.5 font-medium", i > 0 && "text-right")}>
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, i) => (
              <td key={i} className={cx("py-1.5 text-slate-700", i > 0 && "text-right tabular-nums")}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ChartTooltip({
  active,
  payload,
  label,
  value,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  label?: string | number;
  value: (row: Record<string, unknown>) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-md">
      {/* Values lead, labels follow. */}
      <p className="text-sm font-semibold text-slate-900">{value(payload[0].payload)}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
