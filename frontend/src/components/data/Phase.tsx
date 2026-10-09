export function DetailList({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="shrink-0 text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words text-right text-slate-900">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
