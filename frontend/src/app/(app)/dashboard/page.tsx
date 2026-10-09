"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { ChartCard, DataTableView } from "@/components/charts/ChartCard";
import { HBarChart } from "@/components/charts/HBarChart";
import { RepTable } from "@/components/dashboard/RepTable";
import { StatTile } from "@/components/dashboard/StatTile";
import { Button, Card, PageHeader, Skeleton } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { get } from "@/lib/api/client";
import type { DashboardData } from "@/lib/api/types";
import { browserTimeZone, formatCompactMoney, formatCount, formatMoney, formatPercent, localDateString } from "@/lib/format";

export default function DashboardPage() {
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["reports", "dashboard"],
    queryFn: () => get<DashboardData>("/reports/dashboard/", { tz: browserTimeZone() }),
    placeholderData: keepPreviousData,
  });
  const now = new Date();
  const monthStart = localDateString(new Date(now.getFullYear(), now.getMonth(), 1));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={manager ? "Team results for this month" : "Your results for this month"}
      />
      {isError ? (
        <Card className="text-center text-sm text-slate-600">
          <p>Couldn&apos;t load the dashboard.</p>
          <Button variant="secondary" className="mt-3" onClick={() => refetch()}>
            Retry
          </Button>
        </Card>
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="New leads this month"
              value={formatCount(data.kpis.new_leads_this_month)}
              context={`${formatCount(data.kpis.total_leads)} leads in total`}
              href={`/leads?created_after=${monthStart}`}
            />
            <StatTile
              label="Conversion rate"
              value={formatPercent(data.kpis.conversion_rate)}
              meter={data.kpis.conversion_rate}
              context={`${formatCount(data.kpis.converted_leads)} of ${formatCount(data.kpis.total_leads)} leads converted`}
              href="/leads?status=converted"
            />
            <StatTile
              label="Open deal value"
              value={formatCompactMoney(data.kpis.open_deal_value)}
              context={`${formatCount(data.kpis.open_deal_count)} open deal${data.kpis.open_deal_count === 1 ? "" : "s"}`}
              href="/deals"
            />
            <StatTile
              label="Won this month"
              value={formatCompactMoney(data.kpis.won_value_this_month)}
              context={`${formatCount(data.kpis.won_count_this_month)} deal${data.kpis.won_count_this_month === 1 ? "" : "s"} won`}
              href="/deals?view=list&is_open=false"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard
              title="Leads by status"
              description="All leads"
              fetching={isFetching}
              table={<DataTableView columns={["Status", "Leads"]} rows={data.leads_by_status.map((r) => [r.label, formatCount(r.count)])} />}
            >
              <HBarChart
                data={data.leads_by_status.map((r) => ({ label: r.label, value: r.count, display: formatCount(r.count) }))}
                tooltip={(d) => `${d.display} lead${d.value === 1 ? "" : "s"}`}
              />
            </ChartCard>
            <ChartCard
              title="Leads by source"
              description="All leads"
              fetching={isFetching}
              table={<DataTableView columns={["Source", "Leads"]} rows={data.leads_by_source.map((r) => [r.name, formatCount(r.count)])} />}
            >
              {data.leads_by_source.length ? (
                <HBarChart
                  data={foldOther(data.leads_by_source.map((r) => ({ label: r.name, value: r.count })), 7).map((d) => ({
                    ...d,
                    display: formatCount(d.value),
                  }))}
                  tooltip={(d) => `${d.display} lead${d.value === 1 ? "" : "s"}`}
                />
              ) : (
                <p className="py-6 text-center text-sm text-slate-400">No leads yet.</p>
              )}
            </ChartCard>
            <ChartCard
              title="Deals by stage"
              description="Total value per stage"
              fetching={isFetching}
              table={
                <DataTableView
                  columns={["Stage", "Deals", "Value"]}
                  rows={data.deals_by_stage.map((r) => [r.name, formatCount(r.count), formatMoney(r.value)])}
                />
              }
            >
              <HBarChart
                data={data.deals_by_stage.map((r) => ({
                  label: r.name,
                  value: Number(r.value),
                  display: formatCompactMoney(r.value),
                }))}
                tooltip={(d) => {
                  const row = data.deals_by_stage.find((r) => r.name === d.label);
                  return `${formatMoney(d.value)} · ${row?.count ?? 0} deal${row?.count === 1 ? "" : "s"}`;
                }}
              />
            </ChartCard>
          </div>

          {data.leaderboard && (
            <Card>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Rep leaderboard</h2>
                  <p className="mt-0.5 text-xs text-slate-500">This month, ranked by won value</p>
                </div>
                <Link href="/reports" className="text-xs font-medium text-indigo-600 hover:underline">
                  Full report →
                </Link>
              </div>
              <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <RepTable reps={data.leaderboard} compact />
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

/** Keep the chart to a handful of bars: the long tail folds into "Other". */
function foldOther(rows: { label: string; value: number }[], keep: number) {
  if (rows.length <= keep + 1) return rows;
  const rest = rows.slice(keep).reduce((n, r) => n + r.value, 0);
  return [...rows.slice(0, keep), { label: "Other", value: rest }];
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
