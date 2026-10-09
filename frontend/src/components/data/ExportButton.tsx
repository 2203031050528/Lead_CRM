import { toQueryString, type Query } from "@/lib/api/client";

/** Downloads the current list (same filters/search/ordering) as CSV. A plain link: the browser
 * sends the session cookie and saves the streamed file. */
export function ExportButton({ resource, query }: { resource: "leads" | "contacts" | "deals"; query: Query }) {
  const filters = Object.fromEntries(Object.entries(query).filter(([k]) => k !== "page" && k !== "page_size"));
  return (
    <a
      href={`/api/v1/${resource}/export/${toQueryString(filters)}`}
      download
      className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      Export CSV
    </a>
  );
}
