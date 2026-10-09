"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { LEAD_STATUSES } from "@/components/data/badges";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Alert, Button, cx, Field, Input, Modal, Select, Textarea, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useSources, useTags } from "@/hooks/useLookups";
import { patch, post } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const EDITABLE_STATUSES = ["new", "contacted", "qualified", "lost"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  phone: z.string().trim().max(30, "Too long"),
  company_name: z.string().trim().max(200),
  source: z.string(),
  status: z.string(),
  estimated_value: z.string().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter an amount, e.g. 1500 or 1500.50"),
  owner: z.string(),
  tags: z.array(z.number()),
  notes: z.string(),
});
type Values = z.infer<typeof schema>;
const FIELDS = Object.keys(schema.shape);

function toValues(lead?: Lead | null, meId?: number): Values {
  return {
    name: lead?.name ?? "",
    email: lead?.email ?? "",
    phone: lead?.phone ?? "",
    company_name: lead?.company_name ?? "",
    source: lead?.source ? String(lead.source) : "",
    status: lead?.status ?? "new",
    estimated_value: lead ? String(Number(lead.estimated_value)) : "",
    owner: String(lead?.owner ?? meId ?? ""),
    tags: lead?.tags ?? [],
    notes: lead?.notes ?? "",
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  onSaved?: (lead: Lead) => void;
}

export function LeadFormModal(props: Props) {
  const { open, onClose, lead } = props;
  // Modal renders its children only while open, so the form mounts fresh (with its
  // default values) every time; no reset effect that could wipe early keystrokes.
  return (
    <Modal open={open} onClose={onClose} title={lead ? "Edit lead" : "New lead"} wide>
      <LeadForm {...props} />
    </Modal>
  );
}

function LeadForm({ onClose, lead, onSaved }: Props) {
  const { data: me } = useMe();
  const { data: sources } = useSources();
  const { data: tags } = useTags();
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const manager = canManage(me?.role);
  const converted = lead?.status === "converted";

  const { register, handleSubmit, control, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(lead, me?.id),
  });

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        name: v.name,
        email: v.email,
        phone: v.phone,
        company_name: v.company_name,
        source: v.source ? Number(v.source) : null,
        estimated_value: v.estimated_value || "0",
        tags: v.tags,
        notes: v.notes,
        ...(!converted && { status: v.status }),
        ...(manager && v.owner && { owner: Number(v.owner) }),
      };
      return lead ? patch<Lead>(`/leads/${lead.id}/`, body) : post<Lead>("/leads/", body);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["leads"] });
      toast(lead ? "Lead updated" : "Lead created");
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, FIELDS)),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoFocus {...register("name")} />
        </Field>
        <Field label="Company" htmlFor="company_name" error={errors.company_name?.message}>
          <Input id="company_name" {...register("company_name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </Field>
        <Field label="Source" htmlFor="source" error={errors.source?.message}>
          <Select id="source" {...register("source")}>
            <option value="">—</option>
            {sources?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="status" error={errors.status?.message}
          hint={converted ? "Converted leads keep their status." : undefined}>
          <Select id="status" disabled={converted} {...register("status")}>
            {LEAD_STATUSES.filter((s) => converted || (EDITABLE_STATUSES as readonly string[]).includes(s.value)).map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Estimated value (USD)" htmlFor="estimated_value" error={errors.estimated_value?.message}>
          <Input id="estimated_value" inputMode="decimal" placeholder="0" {...register("estimated_value")} />
        </Field>
        {manager && (
          <Field label="Owner" htmlFor="owner" error={errors.owner?.message}>
            <OwnerSelect id="owner" {...register("owner")} />
          </Field>
        )}
      </div>
      {!!tags?.length && (
        <Field label="Tags" error={errors.tags?.message}>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const on = field.value.includes(t.id);
                  return (
                    <button
                      type="button"
                      key={t.id}
                      aria-pressed={on}
                      onClick={() => field.onChange(on ? field.value.filter((x) => x !== t.id) : [...field.value, t.id])}
                      className={cx(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                        on ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </button>
                  );
                })}
              </div>
            )}
          />
        </Field>
      )}
      <Field label="Notes" htmlFor="notes" error={errors.notes?.message}>
        <Textarea id="notes" {...register("notes")} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {lead ? "Save changes" : "Create lead"}
        </Button>
      </div>
    </form>
  );
}
