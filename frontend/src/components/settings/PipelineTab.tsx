"use client";

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { stageTone } from "@/components/deals/stages";
import { Alert, Button, Card, ConfirmDialog, cx, Field, ICONS, IconButton, Input, Modal, Segmented, Skeleton, useToast } from "@/components/ui";
import { useStages } from "@/hooks/useLookups";
import { ApiError, del, patch, post } from "@/lib/api/client";
import type { PipelineStage } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";

type Stage = PipelineStage & { deal_count?: number };
const GRIP = "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01";

export function PipelineTab() {
  const { data: stages, isLoading } = useStages();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Stage | "new" | null>(null);
  const [deleting, setDeleting] = useState<Stage | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["stages"] });
    qc.invalidateQueries({ queryKey: ["deals"] });
  };

  const reorder = useMutation({
    mutationFn: (ids: number[]) => post<Stage[]>("/stages/reorder/", { ids }),
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: ["stages"] });
      const previous = qc.getQueryData<Stage[]>(["stages"]);
      if (previous) qc.setQueryData(["stages"], ids.map((id) => previous.find((s) => s.id === id)!));
      return previous;
    },
    onError: (err, _ids, previous) => {
      qc.setQueryData(["stages"], previous);
      toast(err instanceof ApiError ? err.message : "Couldn't save the new order", "error");
    },
    onSuccess: () => toast("Stage order saved"),
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: (s: Stage) => del(`/stages/${s.id}/`),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast("Stage deleted");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't delete the stage", "error"),
  });

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!stages || !over || active.id === over.id) return;
    const ids = stages.map((s) => s.id);
    reorder.mutate(arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id))));
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">Columns of the deals board, in order. Drag the handle (or focus it and use Space and the arrow keys) to reorder.</p>
        <Button onClick={() => setEditing("new")}>Add stage</Button>
      </div>
      <Card className="p-0">
        {isLoading || !stages ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ) : stages.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">No stages yet. Add the first one.</p>
        ) : (
          <DndContext id="stage-order" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-slate-100">
                {(stages as Stage[]).map((s) => (
                  <StageRow key={s.id} stage={s} onEdit={() => setEditing(s)} onDelete={() => setDeleting(s)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add stage" : "Edit stage"}>
        {editing !== null && (
          <StageForm
            stage={editing === "new" ? null : editing}
            nextOrder={stages?.length ?? 0}
            onDone={() => {
              refresh();
              setEditing(null);
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete stage?"
        message={<>“{deleting?.name}” will be removed from the pipeline.</>}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function StageRow({ stage, onEdit, onDelete }: { stage: Stage; onEdit: () => void; onDelete: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const tone = stageTone(stage);
  const inUse = (stage.deal_count ?? 0) > 0;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx("flex items-center gap-3 bg-white px-3 py-2.5", isDragging && "relative z-10 shadow-md ring-1 ring-slate-200")}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Reorder ${stage.name}`}
        className="cursor-grab rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        {...attributes}
        {...listeners}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
          <path d={GRIP} />
        </svg>
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{stage.name}</span>
      <span
        className={cx(
          "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
          tone === "won" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : tone === "lost" ? "bg-red-50 text-red-700 ring-red-600/20" : "bg-slate-50 text-slate-600 ring-slate-500/20",
        )}
      >
        {tone === "won" ? "Won" : tone === "lost" ? "Lost" : "Open"}
      </span>
      <span className="hidden w-20 text-right text-xs tabular-nums text-slate-500 sm:block">
        {stage.deal_count ?? 0} deal{stage.deal_count === 1 ? "" : "s"}
      </span>
      <IconButton label={`Edit ${stage.name}`} icon={ICONS.pencil} onClick={onEdit} />
      <IconButton
        label={inUse ? `${stage.name} has deals; move them first` : `Delete ${stage.name}`}
        icon={ICONS.trash}
        disabled={inUse}
        onClick={onDelete}
      />
    </li>
  );
}

const stageSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  kind: z.enum(["open", "won", "lost"]),
});
type StageValues = z.infer<typeof stageSchema>;

function StageForm({ stage, nextOrder, onDone }: { stage: Stage | null; nextOrder: number; onDone: () => void }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, watch, setValue, formState: { errors, isSubmitting } } = useForm<StageValues>({
    resolver: zodResolver(stageSchema),
    defaultValues: { name: stage?.name ?? "", kind: stageTone(stage ?? undefined) },
  });
  const kind = watch("kind");
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    const body = { name: v.name, is_won: v.kind === "won", is_lost: v.kind === "lost" };
    try {
      if (stage) await patch(`/stages/${stage.id}/`, body);
      else await post("/stages/", { ...body, order: nextOrder });
      toast(stage ? "Stage updated" : "Stage added");
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name"]));
    }
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Name" htmlFor="stage-name" error={errors.name?.message}>
        <Input id="stage-name" autoFocus {...register("name")} />
      </Field>
      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-slate-700">Type</span>
        <Segmented
          label="Stage type"
          value={kind}
          onChange={(v) => setValue("kind", v)}
          options={[
            { value: "open", label: "Open" },
            { value: "won", label: "Won" },
            { value: "lost", label: "Lost" },
          ]}
        />
        <p className="text-xs text-slate-500">Moving a deal into a Won or Lost stage closes it.</p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {stage ? "Save changes" : "Add stage"}
        </Button>
      </div>
    </form>
  );
}
