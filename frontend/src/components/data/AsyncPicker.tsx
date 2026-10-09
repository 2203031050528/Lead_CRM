"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui";
import { get } from "@/lib/api/client";
import type { Paginated } from "@/lib/api/types";

/** Search-as-you-type picker for large tables (e.g. companies). Value is the selected id. */
export function AsyncPicker<T extends { id: number }>({
  endpoint,
  value,
  initialLabel,
  label,
  onChange,
  placeholder = "Search…",
  id,
}: {
  endpoint: string;
  value: number | null;
  initialLabel?: string;
  label: (row: T) => string;
  onChange: (id: number | null, row: T | null) => void;
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState(initialLabel ?? "");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setText(initialLabel ?? ""), [initialLabel]);
  useEffect(() => {
    const t = setTimeout(() => setQ(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: [endpoint, "picker", q],
    queryFn: () => get<Paginated<T>>(endpoint, { search: q, page_size: 8 }),
    enabled: open,
  });

  return (
    <div className="relative" ref={ref}>
      <Input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value !== null) onChange(null, null);
        }}
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
          {value !== null && (
            <li>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-slate-500 hover:bg-slate-50"
                onClick={() => {
                  onChange(null, null);
                  setText("");
                  setOpen(false);
                }}
              >
                Clear selection
              </button>
            </li>
          )}
          {isFetching && !data && <li className="px-3 py-2 text-slate-400">Searching…</li>}
          {data?.results.length === 0 && <li className="px-3 py-2 text-slate-400">No matches</li>}
          {data?.results.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
                onClick={() => {
                  onChange(row.id, row);
                  setText(label(row));
                  setOpen(false);
                }}
              >
                {label(row)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
