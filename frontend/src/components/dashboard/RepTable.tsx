import { cx } from "@/components/ui";
import type { RepPerformance } from "@/lib/api/types";
import { formatCompactMoney, formatMoney } from "@/lib/format";

const COLUMNS: { key: keyof RepPerformance; label: string; money?: boolean; className?: string }[] = [
  { key: "won_value", label: "Won value", money: true },
  { key: "won_count", label: "Deals won" },
  { key: "lost_count", label: "Deals lost", className: "hidden md:table-cell" },
  { key: "new_leads", label: "New leads", className: "hidden sm:table-cell" },
  { key: "converted_leads", label: "Converted", className: "hidden sm:table-cell" },
  { key: "open_value", label: "Open pipeline", money: true, className: "hidden lg:table-cell" },
];

/** Ranked rep table; numbers right-aligned in tabular figures. */
export function RepTable({ reps, compact }: { reps: RepPerformance[]; compact?: boolean }) {
  if (reps.length === 0) return <p className="py-6 text-center text-sm text-slate-400">No active sales reps yet.</p>;
  const columns = compact ? COLUMNS.filter((c) => c.key !== "lost_count") : COLUMNS;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th scope="col" className="w-8 py-2 font-medium">#</th>
            <th scope="col" className="py-2 font-medium">Rep</th>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx("py-2 pl-4 text-right font-medium", c.className)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {reps.map((r, i) => (
            <tr key={r.user}>
              <td className="py-2 text-slate-400 tabular-nums">{i + 1}</td>
              <td className="py-2 font-medium text-slate-900">{r.name}</td>
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cx("py-2 pl-4 text-right tabular-nums text-slate-700", c.className)}
                  title={c.money ? formatMoney(r[c.key] as string) : undefined}
                >
                  {c.money ? formatCompactMoney(r[c.key] as string) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
