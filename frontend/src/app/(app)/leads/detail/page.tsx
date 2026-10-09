"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { StatusBadge, TagChip } from "@/components/data/badges";
import { DetailState } from "@/components/data/DetailState";
import { DetailList } from "@/components/data/Phase";
import { ConvertLeadModal } from "@/components/leads/ConvertLeadModal";
import { LeadFormModal } from "@/components/leads/LeadFormModal";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { Button, Card, ConfirmDialog } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useDeleteRecord } from "@/hooks/useDeleteRecord";
import { useIdParam } from "@/hooks/useListParams";
import { get } from "@/lib/api/client";
import type { Deal, Lead, Paginated } from "@/lib/api/types";
import { formatDate, formatMoney } from "@/lib/format";

export default function LeadDetailPage() {
  const id = useIdParam();
  const router = useRouter();
  const { data: me } = useMe();
  const [editing, setEditing] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteRecord("leads", "Lead", "/leads");

  const { data: lead, isLoading, error } = useQuery({
    queryKey: ["leads", "detail", id],
    queryFn: () => get<Lead>(`/leads/${id}/`),
    enabled: id !== null,
  });
  const { data: deals } = useQuery({
    queryKey: ["deals", "list", { lead: id }],
    queryFn: () => get<Paginated<Deal>>("/deals/", { lead: id! }),
    enabled: !!lead && lead.status === "converted",
  });

  if (!lead) return <DetailState loading={isLoading && id !== null} error={error} backHref="/leads" backLabel="Back to leads" />;
  const converted = lead.status === "converted";

  return (
    <>
      <Link href="/leads" className="text-sm text-slate-500 hover:text-slate-700">← Leads</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{lead.name}</h1>
            <StatusBadge status={lead.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {lead.company_name || "No company"} · {formatMoney(lead.estimated_value)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!converted && <Button onClick={() => setConverting(true)}>Convert</Button>}
          <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
          {canManage(me?.role) && <Button variant="danger" onClick={() => setDeleting(true)}>Delete</Button>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Details</h2>
            <DetailList
              items={[
                ["Email", lead.email && <a href={`mailto:${lead.email}`} className="text-indigo-600 hover:underline">{lead.email}</a>],
                ["Phone", lead.phone && <a href={`tel:${lead.phone}`} className="text-indigo-600 hover:underline">{lead.phone}</a>],
                ["Company", lead.company_name],
                ["Source", lead.source_name],
                ["Owner", lead.owner_name],
                ["Created", formatDate(lead.created_at, true)],
                ["Updated", formatDate(lead.updated_at, true)],
              ]}
            />
            {lead.tag_details.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">{lead.tag_details.map((t) => <TagChip key={t.id} tag={t} />)}</div>
            )}
          </Card>
          {converted && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Conversion</h2>
              <ul className="space-y-1.5 text-sm">
                {lead.converted_contact && (
                  <li><Link href={`/contacts/detail?id=${lead.converted_contact}`} className="text-indigo-600 hover:underline">View contact →</Link></li>
                )}
                {deals?.results.map((d) => (
                  <li key={d.id}>
                    <Link href={`/deals/detail?id=${d.id}`} className="text-indigo-600 hover:underline">{d.title}</Link>{" "}
                    <span className="text-slate-500">· {d.stage_name} · {formatMoney(d.value)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {lead.notes && (
            <Card>
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Notes</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{lead.notes}</p>
            </Card>
          )}
        </div>
        <div className="space-y-6 lg:col-span-2">
          <TaskPanel parent={{ field: "lead", id: lead.id, label: lead.name }} />
          <ActivityTimeline parent={{ field: "lead", id: lead.id }} />
          <AttachmentsPanel parent={{ field: "lead", id: lead.id }} />
        </div>
      </div>

      <LeadFormModal open={editing} onClose={() => setEditing(false)} lead={lead} />
      <ConvertLeadModal
        lead={lead}
        open={converting}
        onClose={() => setConverting(false)}
        onConverted={(r) => {
          setConverting(false);
          router.push(`/contacts/detail?id=${r.contact}`);
        }}
      />
      <ConfirmDialog
        open={deleting}
        title="Delete lead?"
        message={<>This permanently deletes <strong>{lead.name}</strong> and its activities, tasks and attachments.</>}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(lead.id)}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
