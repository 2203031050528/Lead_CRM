import Link from "next/link";

import { Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api/client";

/** Loading / not-found states shared by detail pages. */
export function DetailState({ loading, error, backHref, backLabel }: { loading: boolean; error: unknown; backHref: string; backLabel: string }) {
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-64 lg:col-span-1" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      </div>
    );
  }
  const notFound = !error || (error instanceof ApiError && error.status === 404);
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold text-slate-900">{notFound ? "Not found" : "Couldn’t load this record"}</p>
      <p className="mt-1 text-sm text-slate-500">
        {notFound ? "It may have been deleted, or you don’t have access to it." : "Please try again."}
      </p>
      <Link href={backHref} className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
        ← {backLabel}
      </Link>
    </div>
  );
}
