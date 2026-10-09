"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  Alert,
  Button,
  Card,
  ConfirmDialog,
  cx,
  Field,
  Icon,
  ICONS,
  IconButton,
  Input,
  Modal,
  Segmented,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { ApiError, del, get, patch, post } from "@/lib/api/client";
import type { Activity, ActivityType, Paginated } from "@/lib/api/types";
import { formatDate, fromLocalInput, timeAgo, toLocalInput } from "@/lib/format";
import { applyServerErrors, zodResolver } from "@/lib/forms";

export interface ActivityParent {
  field: "lead" | "deal" | "contact";
  id: number;
}

const TYPES: Record<ActivityType, { label: string; icon: string; tone: string }> = {
  note: { label: "Note", icon: ICONS.note, tone: "bg-slate-100 text-slate-600" },
  call: { label: "Call", icon: ICONS.phone, tone: "bg-emerald-100 text-emerald-700" },
  meeting: { label: "Meeting", icon: ICONS.calendar, tone: "bg-violet-100 text-violet-700" },
  email: { label: "Email", icon: ICONS.mail, tone: "bg-sky-100 text-sky-700" },
};
const TYPE_OPTIONS = (Object.keys(TYPES) as ActivityType[]).map((value) => ({ value, label: TYPES[value].label }));

const schema = z.object({
  type: z.enum(["note", "call", "meeting", "email"]),
  subject: z.string().trim().min(1, "Add a short subject").max(200),
  body: z.string(),
  occurred_at: z.string().min(1, "Pick a date and time"),
});
type Values = z.infer<typeof schema>;
type Body = Omit<Values, "occurred_at"> & { occurred_at: string };

const freshValues = (type: ActivityType = "note"): Values => ({
  type,
  subject: "",
  body: "",
  occurred_at: toLocalInput(new Date()),
});

export function ActivityTimeline({ parent }: { parent: ActivityParent }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const queryKey = ["activities", parent.field, parent.id];
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState<Activity | null>(null);

  const list = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      get<Paginated<Activity>>("/activities/", { [parent.field]: parent.id, page: pageParam, page_size: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (last.next ? all.length + 1 : undefined),
  });
  const items = list.data?.pages.flatMap((p) => p.results) ?? [];
  const count = list.data?.pages[0]?.count;
  const refresh = () => qc.invalidateQueries({ queryKey });

  const remove = useMutation({
    mutationFn: (a: Activity) => del(`/activities/${a.id}/`),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast("Activity deleted");
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : "Couldn't delete the activity", "error"),
  });

  const canChange = (a: Activity) => a.user === me?.id || canManage(me?.role);

  return (
    <Card className="p-0">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Activity{count !== undefined ? ` (${count})` : ""}
        </h2>
      </div>
      <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
        <ActivityForm
          initial={freshValues()}
          submitLabel="Log activity"
          resetAfterSave
          save={async (body) => {
            await post<Activity>("/activities/", { ...body, [parent.field]: parent.id });
            refresh();
            toast(`${TYPES[body.type].label} logged`);
          }}
        />
      </div>
      {list.isLoading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : list.isError ? (
        <p className="px-5 py-6 text-sm text-red-600">Couldn&apos;t load activity.</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-slate-400">No activity yet. Log a call, meeting, email or note above.</p>
      ) : (
        <ol className="divide-y divide-slate-100">
          {items.map((a) => (
            <li key={a.id} className="group flex gap-3 px-5 py-4">
              <span className={cx("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TYPES[a.type].tone)}>
                <Icon d={TYPES[a.type].icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-medium text-slate-900">{a.subject}</p>
                  <time dateTime={a.occurred_at} title={formatDate(a.occurred_at, true)} className="text-xs text-slate-400">
                    {timeAgo(a.occurred_at)}
                  </time>
                </div>
                {a.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600">{a.body}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {TYPES[a.type].label} · {a.user_name}
                </p>
              </div>
              {canChange(a) && (
                <div className="flex shrink-0 items-start gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                  <IconButton label="Edit activity" icon={ICONS.pencil} onClick={() => setEditing(a)} />
                  <IconButton label="Delete activity" icon={ICONS.trash} onClick={() => setDeleting(a)} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {list.hasNextPage && (
        <div className="border-t border-slate-100 px-5 py-3">
          <Button variant="ghost" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            Load older activity
          </Button>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit activity">
        {editing && (
          <ActivityForm
            initial={{
              type: editing.type,
              subject: editing.subject,
              body: editing.body,
              occurred_at: toLocalInput(new Date(editing.occurred_at)),
            }}
            submitLabel="Save changes"
            onCancel={() => setEditing(null)}
            save={async (body) => {
              await patch<Activity>(`/activities/${editing.id}/`, body);
              refresh();
              setEditing(null);
              toast("Activity updated");
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title="Delete activity?"
        message={<>This removes “{deleting?.subject}” from the timeline.</>}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </Card>
  );
}

function ActivityForm({
  initial,
  submitLabel,
  save,
  onCancel,
  resetAfterSave,
}: {
  initial: Values;
  submitLabel: string;
  save: (body: Body) => Promise<void>;
  onCancel?: () => void;
  resetAfterSave?: boolean;
}) {
  const uid = useId();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, reset, setError, getValues, formState: { errors, isSubmitting } } =
    useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    try {
      await save({ ...v, occurred_at: fromLocalInput(v.occurred_at) });
      if (resetAfterSave) reset(freshValues(getValues("type")));
    } catch (err) {
      setFormError(applyServerErrors(err, setError, Object.keys(schema.shape)));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Controller
        control={control}
        name="type"
        render={({ field }) => (
          <Segmented label="Activity type" value={field.value} onChange={field.onChange} options={TYPE_OPTIONS} />
        )}
      />
      <Field label="Subject" htmlFor={`${uid}-subject`} error={errors.subject?.message}>
        <Input id={`${uid}-subject`} placeholder="e.g. Intro call with procurement" {...register("subject")} />
      </Field>
      <Field label="Details" htmlFor={`${uid}-body`} error={errors.body?.message}>
        <Textarea id={`${uid}-body`} rows={2} placeholder="Optional" {...register("body")} />
      </Field>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="When" htmlFor={`${uid}-when`} error={errors.occurred_at?.message}>
          <Input id={`${uid}-when`} type="datetime-local" className="w-auto" {...register("occurred_at")} />
        </Field>
        <div className="flex gap-2">
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}
