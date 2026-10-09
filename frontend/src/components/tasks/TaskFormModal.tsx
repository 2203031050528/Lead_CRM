"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { AsyncPicker } from "@/components/data/AsyncPicker";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Alert, Button, Field, Input, Modal, Segmented, Textarea, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { patch, post } from "@/lib/api/client";
import type { Deal, Lead, Task } from "@/lib/api/types";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { applyServerErrors, zodResolver } from "@/lib/forms";

export interface TaskParent {
  field: "lead" | "deal";
  id: number;
  label: string;
}

const schema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: z.string(),
    due_at: z.string(),
    assigned_to: z.string(),
    relation: z.enum(["none", "lead", "deal"]),
    lead: z.number().nullable(),
    deal: z.number().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.relation === "lead" && v.lead === null) ctx.addIssue({ code: "custom", path: ["lead"], message: "Choose a lead" });
    if (v.relation === "deal" && v.deal === null) ctx.addIssue({ code: "custom", path: ["deal"], message: "Choose a deal" });
  });
type Values = z.infer<typeof schema>;
const FIELDS = ["title", "description", "due_at", "assigned_to", "lead", "deal"];

function tomorrowAtNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
}

const toValues = (task: Task | null | undefined, parent: TaskParent | undefined, meId?: number): Values => ({
  title: task?.title ?? "",
  description: task?.description ?? "",
  due_at: task ? (task.due_at ? toLocalInput(new Date(task.due_at)) : "") : tomorrowAtNine(),
  assigned_to: String(task?.assigned_to ?? meId ?? ""),
  relation: task ? (task.lead ? "lead" : task.deal ? "deal" : "none") : (parent?.field ?? "none"),
  lead: task?.lead ?? (parent?.field === "lead" ? parent.id : null),
  deal: task?.deal ?? (parent?.field === "deal" ? parent.id : null),
});

interface Props {
  open: boolean;
  onClose: () => void;
  task?: Task | null;
  /** Fixed lead/deal (task added from a detail page); hides the relation picker. */
  parent?: TaskParent;
}

export function TaskFormModal(props: Props) {
  const { open, onClose, task } = props;
  // Modal renders its children only while open, so the form mounts fresh (with its
  // default values) every time; no reset effect that could wipe early keystrokes.
  return (
    <Modal open={open} onClose={onClose} title={task ? "Edit task" : "New task"} wide>
      <TaskForm {...props} />
    </Modal>
  );
}

function TaskForm({ onClose, task, parent }: Props) {
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(task, parent, me?.id),
  });
  const relation = watch("relation");

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        title: v.title,
        description: v.description,
        due_at: v.due_at ? fromLocalInput(v.due_at) : null,
        ...(manager && v.assigned_to && { assigned_to: Number(v.assigned_to) }),
        ...(parent
          ? !task && { [parent.field]: parent.id }
          : { lead: v.relation === "lead" ? v.lead : null, deal: v.relation === "deal" ? v.deal : null }),
      };
      return task ? patch<Task>(`/tasks/${task.id}/`, body) : post<Task>("/tasks/", body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast(task ? "Task updated" : "Task created");
      onClose();
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, FIELDS)),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Title" htmlFor="task-title" error={errors.title?.message}>
        <Input id="task-title" autoFocus placeholder="e.g. Send the proposal" {...register("title")} />
      </Field>
      <Field label="Description" htmlFor="task-description" error={errors.description?.message}>
        <Textarea id="task-description" rows={3} {...register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Due" htmlFor="task-due" error={errors.due_at?.message} hint="Leave empty for no due date.">
          <Input id="task-due" type="datetime-local" {...register("due_at")} />
        </Field>
        {manager && (
          <Field label="Assigned to" htmlFor="task-assignee" error={errors.assigned_to?.message}>
            <OwnerSelect id="task-assignee" {...register("assigned_to")} />
          </Field>
        )}
      </div>
      {parent ? (
        <p className="text-sm text-slate-600">
          Related {parent.field}: <span className="font-medium text-slate-900">{parent.label}</span>
        </p>
      ) : (
        <div className="space-y-3">
          <Controller
            control={control}
            name="relation"
            render={({ field }) => (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-slate-700">Related to</span>
                <Segmented
                  label="Related to"
                  value={field.value}
                  onChange={field.onChange}
                  options={[
                    { value: "none", label: "Nothing" },
                    { value: "lead", label: "Lead" },
                    { value: "deal", label: "Deal" },
                  ]}
                />
              </div>
            )}
          />
          {relation === "lead" && (
            <Field label="Lead" htmlFor="task-lead" error={errors.lead?.message}>
              <Controller
                control={control}
                name="lead"
                render={({ field }) => (
                  <AsyncPicker<Lead>
                    id="task-lead"
                    endpoint="/leads/"
                    value={field.value}
                    initialLabel={task?.lead_name ?? ""}
                    label={(l) => (l.company_name ? `${l.name} (${l.company_name})` : l.name)}
                    placeholder="Search leads…"
                    onChange={(id) => field.onChange(id)}
                  />
                )}
              />
            </Field>
          )}
          {relation === "deal" && (
            <Field label="Deal" htmlFor="task-deal" error={errors.deal?.message}>
              <Controller
                control={control}
                name="deal"
                render={({ field }) => (
                  <AsyncPicker<Deal>
                    id="task-deal"
                    endpoint="/deals/"
                    value={field.value}
                    initialLabel={task?.deal_title ?? ""}
                    label={(d) => d.title}
                    placeholder="Search deals…"
                    onChange={(id) => field.onChange(id)}
                  />
                )}
              />
            </Field>
          )}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {task ? "Save changes" : "Create task"}
        </Button>
      </div>
    </form>
  );
}
