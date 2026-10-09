"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { RoleGate } from "@/components/layout/AuthGuard";
import { AuditLogTab } from "@/components/settings/AuditLogTab";
import { LookupTab } from "@/components/settings/LookupTab";
import { PipelineTab } from "@/components/settings/PipelineTab";
import { UsersTab } from "@/components/settings/UsersTab";
import { cx, PageHeader } from "@/components/ui";

const TABS = [
  { key: "users", label: "Users" },
  { key: "pipeline", label: "Pipeline" },
  { key: "sources", label: "Lead sources" },
  { key: "tags", label: "Tags" },
  { key: "audit", label: "Audit log" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function SettingsPage() {
  return (
    <RoleGate roles={["admin"]}>
      <Settings />
    </RoleGate>
  );
}

function Settings() {
  const router = useRouter();
  const pathname = usePathname();
  const requested = useSearchParams().get("tab");
  const tab: Tab = TABS.some((t) => t.key === requested) ? (requested as Tab) : "users";
  // Switching tabs drops the previous tab's filters.
  const open = (key: Tab) => router.replace(key === "users" ? pathname : `${pathname}?tab=${key}`, { scroll: false });

  return (
    <>
      <PageHeader title="Settings" description="Users, pipeline, lead sources, tags and the audit log" />
      <div role="tablist" aria-label="Settings sections" className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            id={`tab-${t.key}`}
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => open(t.key)}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "users" && <UsersTab />}
        {tab === "pipeline" && <PipelineTab />}
        {tab === "sources" && <LookupTab kind="lead-sources" />}
        {tab === "tags" && <LookupTab kind="tags" />}
        {tab === "audit" && <AuditLogTab />}
      </div>
    </>
  );
}
