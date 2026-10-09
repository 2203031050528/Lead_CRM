"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Card, ConfirmDialog, Field, ICONS, IconButton, Input, Modal, Skeleton, useToast } from "@/components/ui";
import { useSources, useTags } from "@/hooks/useLookups";
import { ApiError, del, patch, post } from "@/lib/api/client";
import { applyServerErrors, zodResolver } from "@/lib/forms";

interface Item {
  id: number;
  name: string;
  color?: string;
  lead_count?: number;
}

const PRESETS = ["#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#6b7280"];

/** Lead sources and tags: same list/edit/delete screen; tags also have a colour. */
export function LookupTab({ kind }: { kind: "lead-sources" | "tags" }) {
  const sources = useSources();
  const tags = useTags();
  const { data, isLoading } = kind === "tags" ? tags : sources;
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const noun = kind === "tags" ? "tag" : "lead source";
  const refresh = () => {
    qc.invalidateQueries({ queryKey: [kind] });
    qc.invalidateQueries({ queryKey: ["leads"] });
  };
  const remove = useMutation({
    mutationFn: (item: Item) => del(`/${kind}/${item.id}/`),
    onSuccess: () => {
      refresh();
      setDeleting(null);
      toast(`Deleted ${noun}`);
    },
    onError: (err) => toast(err instanceof ApiError ? err.message : `Couldn't delete the ${noun}`, "error"),
  });
  const items = (data ?? []) as Item[];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {kind === "tags" ? "Labels reps can add to leads." : "Where leads come from. Used in lead forms, filters, imports and reports."}
        </p>
        <Button onClick={() => setEditing("new")}>Add {noun}</Button>
      </div>
      <Card className="p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ) : items.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-400">None yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5">
                {item.color && <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">{item.name}</span>
                <span className="text-xs tabular-nums text-slate-500">
                  {item.lead_count ?? 0} lead{item.lead_count === 1 ? "" : "s"}
                </span>
                <IconButton label={`Edit ${item.name}`} icon={ICONS.pencil} onClick={() => setEditing(item)} />
                <IconButton label={`Delete ${item.name}`} icon={ICONS.trash} onClick={() => setDeleting(item)} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? `Add ${noun}` : `Edit ${noun}`}>
        {editing !== null && (
          <LookupForm
            kind={kind}
            item={editing === "new" ? null : editing}
            onDone={() => {
              refresh();
              setEditing(null);
            }}
          />
        )}
      </Modal>
      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${noun}?`}
        message={
          deleting?.lead_count ? (
            <>
              “{deleting.name}” is used by {deleting.lead_count} lead{deleting.lead_count === 1 ? "" : "s"}.{" "}
              {kind === "tags" ? "The tag will be removed from them." : "They will keep everything else but have no source."}
            </>
          ) : (
            <>“{deleting?.name}” isn&apos;t used by any leads.</>
          )
        }
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
});
type Values = z.infer<typeof schema>;

function LookupForm({ kind, item, onDone }: { kind: "lead-sources" | "tags"; item: Item | null; onDone: () => void }) {
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const isTag = kind === "tags";
  const { register, handleSubmit, setError, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: item?.name ?? "", color: item?.color ?? PRESETS[4] },
  });
  const color = watch("color");
  const submit = handleSubmit(async (v) => {
    setFormError(null);
    const body = isTag ? v : { name: v.name };
    try {
      if (item) await patch(`/${kind}/${item.id}/`, body);
      else await post(`/${kind}/`, body);
      toast(item ? "Saved" : "Added");
      onDone();
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["name", "color"]));
    }
  });
  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Name" htmlFor="lookup-name" error={errors.name?.message}>
        <Input id="lookup-name" autoFocus {...register("name")} />
      </Field>
      {isTag && (
        <Field label="Colour" htmlFor="lookup-color" error={errors.color?.message}>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use colour ${c}`}
                aria-pressed={color === c}
                onClick={() => setValue("color", c)}
                className="h-7 w-7 rounded-full ring-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 aria-pressed:ring-2 aria-pressed:ring-slate-900"
                style={{ backgroundColor: c }}
              />
            ))}
            <input id="lookup-color" type="color" className="h-8 w-10 cursor-pointer rounded border border-slate-300" {...register("color")} />
          </div>
        </Field>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {item ? "Save changes" : "Add"}
        </Button>
      </div>
    </form>
  );
}
