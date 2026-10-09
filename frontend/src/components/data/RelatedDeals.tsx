"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card, Skeleton } from "@/components/ui";
import { get, type Query } from "@/lib/api/client";
import type { Deal, Paginated } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";

/** Compact deals list for contact/company detail pages. */
export function RelatedDeals({ filter }: { filter: Query }) {
  const { data, isLoading } = useQuery({
    queryKey: ["deals", "list", { ...filter, page_size: 50 }],
    queryFn: () => get<Paginated<Deal>>("/deals/", { ...filter, page_size: 50 }),
  });
  return (
    <Card className="p-0">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Deals{data ? ` (${data.count})` : ""}</h2>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-5"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-4 w-1/2" /></div>
      ) : !data?.results.length ? (
        <p className="px-5 py-6 text-sm text-slate-400">No deals yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.results.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div className="min-w-0">
                <Link href={`/deals/detail?id=${d.id}`} className="font-medium text-slate-900 hover:text-indigo-600">{d.title}</Link>
                <p className="text-xs text-slate-500">{d.stage_name} · {d.owner_name} · closes {formatDate(d.expected_close_date)}</p>
              </div>
              <span className="font-medium text-slate-700">{formatMoney(d.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
