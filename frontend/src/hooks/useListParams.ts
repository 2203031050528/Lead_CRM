"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";

import { ApiError } from "@/lib/api/client";

/**
 * List state (filters, search, ordering, page) lives in the URL so it survives
 * reloads and can be shared. Any change other than `page` resets to page 1.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const spString = sp.toString();

  const params = useMemo(() => {
    const p = new URLSearchParams(spString);
    return Object.fromEntries(keys.map((k) => [k, p.get(k) ?? ""])) as Record<K, string>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spString]);
  const page = Math.max(1, Number(sp.get("page")) || 1);

  const set = useCallback(
    (patch: Partial<Record<K | "page", string | number | null>>) => {
      const next = new URLSearchParams(spString);
      for (const [k, v] of Object.entries(patch)) {
        if (v === "" || v === null || v === undefined) next.delete(k);
        else next.set(k, String(v));
      }
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [spString, router, pathname],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);
  const active = keys.some((k) => params[k] !== "" && k !== "ordering");

  return { params, page, set, clear, active };
}

export function useIdParam(): number | null {
  const id = Number(useSearchParams().get("id"));
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** DRF returns 404 "Invalid page" when a list shrinks under the current page; fall back to page 1. */
export function useResetInvalidPage(error: unknown, page: number, set: (p: { page: number | null }) => void) {
  useEffect(() => {
    if (page > 1 && error instanceof ApiError && error.status === 404) set({ page: null });
  }, [error, page, set]);
}
