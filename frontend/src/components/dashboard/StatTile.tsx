import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui";

import { CHART } from "../charts/tokens";

/** Stat tile: label · value (proportional figures) · context line, optionally a meter. */
export function StatTile({
  label,
  value,
  context,
  href,
  meter,
}: {
  label: string;
  value: string;
  context?: ReactNode;
  href?: string;
  /** 0–1: a same-ramp meter under the value (for a ratio against its limit). */
  meter?: number;
}) {
  const body = (
    <Card className="h-full transition-colors group-hover:border-slate-300">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {meter !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: CHART.track }} aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.min(100, meter * 100)}%`, background: CHART.series }} />
        </div>
      )}
      {context && <p className="mt-1.5 text-xs text-slate-500">{context}</p>}
    </Card>
  );
  return href ? (
    <Link href={href} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      {body}
    </Link>
  ) : (
    body
  );
}
