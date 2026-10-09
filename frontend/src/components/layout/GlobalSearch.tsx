"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { get } from "@/lib/api/client";
import type { SearchResults } from "@/lib/api/types";

import { Icon } from "./nav";

const GROUPS: { key: keyof SearchResults; label: string; href: (id: number) => string }[] = [
  { key: "leads", label: "Leads", href: (id) => `/leads/detail?id=${id}` },
  { key: "deals", label: "Deals", href: (id) => `/deals/detail?id=${id}` },
  { key: "contacts", label: "Contacts", href: (id) => `/contacts/detail?id=${id}` },
  { key: "companies", label: "Companies", href: (id) => `/companies/detail?id=${id}` },
];

export function GlobalSearch() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ["search", q],
    queryFn: () => get<SearchResults>("/search/", { q }),
    enabled: q.length >= 2,
    staleTime: 10_000,
  });

  const total = data ? GROUPS.reduce((n, g) => n + data[g.key].length, 0) : 0;
  const go = (href: string) => {
    setOpen(false);
    setText("");
    router.push(href);
  };

  return (
    <div className="relative w-full max-w-md" ref={ref}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <Icon d="M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" className="h-4 w-4" />
        </span>
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Search leads, deals, contacts…"
          aria-label="Global search"
          className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      {open && q.length >= 2 && (
        <div className="absolute z-40 mt-2 w-full rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {isFetching && !data && <p className="px-4 py-3 text-sm text-slate-400">Searching…</p>}
          {data && total === 0 && <p className="px-4 py-3 text-sm text-slate-400">No matches for “{q}”.</p>}
          {data &&
            GROUPS.filter((g) => data[g.key].length).map((g) => (
              <div key={g.key} className="py-1">
                <p className="px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</p>
                {data[g.key].map((hit) => (
                  <button
                    key={hit.id}
                    onClick={() => go(g.href(hit.id))}
                    className="block w-full truncate px-4 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {hit.label}
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
