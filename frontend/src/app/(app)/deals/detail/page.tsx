"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { ActivityTimeline } from "@/components/activities/ActivityTimeline";
import { AttachmentsPanel } from "@/components/attachments/AttachmentsPanel";
import { DetailState } from "@/components/data/DetailState";
import { DetailList } from "@/components/data/Phase";
import { DealFormModal } from "@/components/deals/DealFormModal";
import { StageBadge, StageBar } from "@/components/deals/stages";
import { TaskPanel } from "@/components/tasks/TaskPanel";
import { Button, Card, ConfirmDialog, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useDeleteRecord } from "@/hooks/useDeleteRecord";
import { useIdParam } from "@/hooks/useListParams";
import { useStages } from "@/hooks/useLookups";
import { ApiError, get, patch } from "@/lib/api/client";
import type { Deal, PipelineStage } from "@/lib/api/types";
import { formatDate, formatMoney, localDateString } from "@/lib/format";

export default function DealDetailPage() {
  const id = useIdParam();
  const { data: me } = useMe();
  const { data: stages } = useStages();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const remove = useDeleteRecord("deals", "Deal", "/deals");

  const { data: deal, isLoading, error } = useQuery({
    queryKey: ["deals", "detail", id],
    queryFn: () => get<Deal>(`/deals/${id}/`),
    enabled: id !== null,
  });

  const moveStage = useMutation({
    mutationFn: (stage: PipelineStage) => patch<Deal>(`/deals/${id}/`, { stage: stage.id }),
    onSuccess: (updated) => {
      qc.setQueryData(["deals", "detail", id], updated);
      qc.invalidateQueries({ queryKey: ["deals"] });
      qc.invalidateQueries({ queryKey: ["activities", "deal", id] });
      toast(`Moved to ${updated.stage_name}`);
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't change the stage", "error"),
  });

  if (!deal) return <DetailState loading={isLoading && id !== null} error={error} backHref="/deals" backLabel="Back to deals" />;
  const late = !!deal.expected_close_date && !deal.closed_at && deal.expected_close_date < localDateString();

  return (
    <>
      <Link href="/deals" className="text-sm text-slate-500 hover:text-slate-700">
        ← Deals
      </Link>
      <div className="mb-4 mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-slate-900">{deal.title}</h1>
            <StageBadge stageId={deal.stage} name={deal.stage_name} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatMoney(deal.value)} · {deal.company_name || "No company"} · {deal.owner_name}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
          {canManage(me?.role) && (
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>

      {stages && (
        <Card className="mb-6 py-3">
          <StageBar stages={stages} current={deal.stage} pending={moveStage.isPending} onSelect={(s) => moveStage.mutate(s)} />
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <h2 className="mb-2 text-sm font-semibold text-slate-900">Details</h2>
            <DetailList
              items={[
                ["Value", formatMoney(deal.value)],
                ["Stage", deal.stage_name],
                ["Contact", deal.contact && <Link href={`/contacts/detail?id=${deal.contact}`} className="text-indigo-600 hover:underline">{deal.contact_name}</Link>],
                ["Company", deal.company && <Link href={`/companies/detail?id=${deal.company}`} className="text-indigo-600 hover:underline">{deal.company_name}</Link>],
                ["Source lead", deal.lead && <Link href={`/leads/detail?id=${deal.lead}`} className="text-indigo-600 hover:underline">View lead</Link>],
                ["Owner", deal.owner_name],
                ["Expected close", <span key="close" className={late ? "font-medium text-red-600" : undefined}>{formatDate(deal.expected_close_date)}</span>],
                ["Closed", deal.closed_at && formatDate(deal.closed_at, true)],
                ["Created", formatDate(deal.created_at, true)],
              ]}
            />
          </Card>
        </div>
        <div className="space-y-6 lg:col-span-2">
          <TaskPanel parent={{ field: "deal", id: deal.id, label: deal.title }} />
          <ActivityTimeline parent={{ field: "deal", id: deal.id }} />
          <AttachmentsPanel parent={{ field: "deal", id: deal.id }} />
        </div>
      </div>

      <DealFormModal open={editing} onClose={() => setEditing(false)} deal={deal} />
      <ConfirmDialog
        open={deleting}
        title="Delete deal?"
        message={<>This permanently deletes <strong>{deal.title}</strong> and its activities, tasks and attachments.</>}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(deal.id)}
        onCancel={() => setDeleting(false)}
      />
    </>
  );
}
