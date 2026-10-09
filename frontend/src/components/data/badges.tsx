import { cx } from "@/components/ui";
import type { LeadStatus, Tag } from "@/lib/api/types";

export const LEAD_STATUSES: { value: LeadStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "lost", label: "Lost" },
  { value: "converted", label: "Converted" },
];

const statusStyle: Record<LeadStatus, string> = {
  new: "bg-sky-50 text-sky-700 ring-sky-600/20",
  contacted: "bg-amber-50 text-amber-700 ring-amber-600/20",
  qualified: "bg-violet-50 text-violet-700 ring-violet-600/20",
  lost: "bg-slate-100 text-slate-600 ring-slate-500/20",
  converted: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const label = LEAD_STATUSES.find((s) => s.value === status)?.label ?? status;
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", statusStyle[status])}>
      {label}
    </span>
  );
}

export function TagChip({ tag }: { tag: Tag }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
      {tag.name}
    </span>
  );
}
