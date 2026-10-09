"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { ChartCard, DataTableView } from "@/components/charts/ChartCard";
import { TrendArea } from "@/components/charts/TrendArea";
import { RepTable } from "@/components/dashboard/RepTable";
import { RoleGate } from "@/components/layout/AuthGuard";
import { Card, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { useListParams } from "@/hooks/useListParams";
import { get } from "@/lib/api/client";
import type { PerformanceData } from "@/lib/api/types";
import { browserTimeZone, formatCompactMoney, formatMoney, parseDate } from "@/lib/format";

const PERIODS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_quarter", label: "This quarter" },
  { value: "this_year", label: "This year" },
] as const;
type Period = (typeof PERIODS)[number]["value"];
const KEYS = ["period"] as const;

export default function ReportsPage() {
  return (
    <RoleGate roles={["admin", "manager"]}>
      <Reports />
    </RoleGate>
  );
}

function Reports() {
  const { params, set } = useListParams(KEYS);
  const period: Period = PERIODS.some((p) => p.value === params.period) ? (params.period as Period) : "this_month";
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["reports", "performance", period],
    queryFn: () => get<PerformanceData>("/reports/performance/", { period, tz: browserTimeZone() }),
    placeholderData: keepPreviousData,
  });
  const months = (data?.won_by_month ?? []).map((m) => {
    const d = parseDate(`${m.month}-01`);
    return {
      label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
      full: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
      value: Number(m.value),
      display: formatCompactMoney(m.value),
      count: m.count,
    };
  });

  return (
    <>
      <PageHeader title="Reports" description="Team performance" />
      {isLoading || !data ? (
        <div className="space-y-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-48" />
        </div>
      ) : (
        <div className="space-y-6">
          <ChartCard
            title="Won value by month"
            description="Last 12 months, all reps"
            table={
              <DataTableView
                columns={["Month", "Deals won", "Value"]}
                rows={months.map((m) => [m.full, m.count, formatMoney(m.value)])}
              />
            }
          >
            <TrendArea
              data={months}
              tickFormat={(v) => formatCompactMoney(v)}
              tooltip={(d) => {
                const m = months.find((x) => x.label === d.label);
                return `${formatMoney(d.value)} · ${m?.count ?? 0} deal${m?.count === 1 ? "" : "s"}`;
              }}
            />
          </ChartCard>

          <section className="space-y-3">
            {/* The period filter scopes only what's below it. */}
            <Segmented
              label="Period"
              value={period}
              onChange={(v) => set({ period: v === "this_month" ? "" : v })}
              options={PERIODS.map((p) => ({ value: p.value, label: p.label }))}
            />
            <Card>
              <div className="mb-3">
                <h2 className="text-sm font-semibold text-slate-900">Rep performance</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {data.period.label}: {formatPeriod(data.period.start, data.period.end)} · ranked by won value
                </p>
              </div>
              <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <RepTable reps={data.reps} />
              </div>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}

function formatPeriod(start: string, end: string) {
  // The server's bounds are local to the viewer, so their date part is the calendar day.
  const day = (iso: string) =>
    parseDate(iso.slice(0, 10)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${day(start)} – ${day(end)}`;
}
