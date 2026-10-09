"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { get, patch, post } from "@/lib/api/client";
import type { Notification, Paginated } from "@/lib/api/types";
import { timeAgo } from "@/lib/format";

import { Icon } from "./nav";

const POLL_MS = Number(process.env.NEXT_PUBLIC_POLL_MS ?? 60_000);

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  // Polled; TanStack pauses interval refetches while the tab is hidden.
  const unread = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => get<{ count: number }>("/notifications/unread_count/"),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  const list = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => get<Paginated<Notification>>("/notifications/", { page_size: 10 }),
    enabled: open,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const markRead = useMutation({
    mutationFn: (id: number) => patch(`/notifications/${id}/`, { is_read: true }),
    onSuccess: invalidate,
  });
  const markAll = useMutation({ mutationFn: () => post("/notifications/mark_all_read/"), onSuccess: invalidate });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const count = unread.data?.count ?? 0;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label={`Notifications${count ? `, ${count} unread` : ""}`}
      >
        <Icon d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        {count > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            {count > 0 && (
              <button onClick={() => markAll.mutate()} className="text-xs text-indigo-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {list.isLoading && <li className="px-4 py-6 text-center text-sm text-slate-400">Loading…</li>}
            {list.data?.results.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">You&apos;re all caught up.</li>
            )}
            {list.data?.results.map((n) => (
              <li key={n.id} className={n.is_read ? "" : "bg-indigo-50/50"}>
                <Link
                  href={n.link || "#"}
                  onClick={() => {
                    if (!n.is_read) markRead.mutate(n.id);
                    setOpen(false);
                  }}
                  className="block px-4 py-3 hover:bg-slate-50"
                >
                  <p className="text-sm text-slate-800">{n.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
