"use client";

import { cx } from "@/components/ui";
import { useStages } from "@/hooks/useLookups";
import type { PipelineStage } from "@/lib/api/types";

export const stageTone = (s?: Pick<PipelineStage, "is_won" | "is_lost">) =>
  s?.is_won ? "won" : s?.is_lost ? "lost" : "open";

const badgeStyle = {
  open: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  won: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  lost: "bg-red-50 text-red-700 ring-red-600/20",
};

export function StageBadge({ stageId, name }: { stageId: number; name: string }) {
  const { data: stages } = useStages();
  const tone = stageTone(stages?.find((s) => s.id === stageId));
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", badgeStyle[tone])}>
      {name}
    </span>
  );
}

/** Clickable pipeline progress for the deal page; clicking a stage moves the deal there. */
export function StageBar({
  stages,
  current,
  pending,
  onSelect,
}: {
  stages: PipelineStage[];
  current: number;
  pending?: boolean;
  onSelect: (stage: PipelineStage) => void;
}) {
  const open = stages.filter((s) => !s.is_won && !s.is_lost);
  const closed = stages.filter((s) => s.is_won || s.is_lost);
  const currentIndex = open.findIndex((s) => s.id === current);
  const button = (s: PipelineStage, extra: string) => {
    const active = s.id === current;
    const tone = stageTone(s);
    return (
      <button
        key={s.id}
        type="button"
        disabled={pending || active}
        aria-pressed={active}
        onClick={() => onSelect(s)}
        className={cx(
          "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-default",
          active
            ? tone === "won"
              ? "bg-emerald-600 text-white"
              : tone === "lost"
                ? "bg-red-600 text-white"
                : "bg-indigo-600 text-white"
            : extra,
        )}
      >
        {s.name}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Move deal to stage">
      <div className="flex flex-wrap gap-1">
        {open.map((s, i) =>
          button(s, i < currentIndex ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"),
        )}
      </div>
      {closed.length > 0 && <span className="hidden h-5 w-px bg-slate-200 sm:block" />}
      <div className="flex flex-wrap gap-1">
        {closed.map((s) =>
          button(
            s,
            s.is_won
              ? "border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              : "border border-red-300 text-red-700 hover:bg-red-50",
          ),
        )}
      </div>
    </div>
  );
}
