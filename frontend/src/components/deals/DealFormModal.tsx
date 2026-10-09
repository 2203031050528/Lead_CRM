"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { AsyncPicker } from "@/components/data/AsyncPicker";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Alert, Button, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { useStages } from "@/hooks/useLookups";
import { patch, post } from "@/lib/api/client";
import type { Company, Contact, Deal } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  value: z.string().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter an amount, e.g. 1500 or 1500.50"),
  stage: z.string().min(1, "Choose a stage"),
  contact: z.number().nullable(),
  company: z.number().nullable(),
  expected_close_date: z.string(),
  owner: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (d: Deal | null | undefined, stage: number | undefined, meId?: number): Values => ({
  title: d?.title ?? "",
  value: d ? String(Number(d.value)) : "",
  stage: String(d?.stage ?? stage ?? ""),
  contact: d?.contact ?? null,
  company: d?.company ?? null,
  expected_close_date: d?.expected_close_date ?? "",
  owner: String(d?.owner ?? meId ?? ""),
});

const contactLabel = (c: Contact) => (c.company_name ? `${c.full_name} (${c.company_name})` : c.full_name);

interface Props {
  open: boolean;
  onClose: () => void;
  deal?: Deal | null;
  defaultStage?: number;
  onSaved?: (deal: Deal) => void;
}

export function DealFormModal(props: Props) {
  const { open, onClose, deal } = props;
  // Modal renders its children only while open, so the form mounts fresh (with its
  // default values) every time; no reset effect that could wipe early keystrokes.
  return (
    <Modal open={open} onClose={onClose} title={deal ? "Edit deal" : "New deal"} wide>
      <DealForm {...props} />
    </Modal>
  );
}

function DealForm({ onClose, deal, defaultStage, onSaved }: Props) {
  const { data: me } = useMe();
  const { data: stages } = useStages();
  const manager = canManage(me?.role);
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const [companyLabel, setCompanyLabel] = useState(deal?.company_name ?? "");
  const firstOpen = stages?.find((s) => !s.is_won && !s.is_lost)?.id;

  const { register, handleSubmit, control, setError, setValue, getValues, formState: { errors } } =
    useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(deal, defaultStage ?? firstOpen, me?.id) });


  useEffect(() => {
    if (!getValues("stage") && firstOpen) setValue("stage", String(firstOpen));
  }, [firstOpen, getValues, setValue]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const body = {
        title: v.title,
        value: v.value || "0",
        stage: Number(v.stage),
        contact: v.contact,
        company: v.company,
        expected_close_date: v.expected_close_date || null,
        ...(manager && v.owner && { owner: Number(v.owner) }),
      };
      return deal ? patch<Deal>(`/deals/${deal.id}/`, body) : post<Deal>("/deals/", body);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["deals"] });
      if (deal && saved.stage !== deal.stage) qc.invalidateQueries({ queryKey: ["activities"] });
      toast(deal ? "Deal updated" : "Deal created");
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, Object.keys(schema.shape))),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Title" htmlFor="title" error={errors.title?.message}>
        <Input id="title" autoFocus {...register("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Value (USD)" htmlFor="value" error={errors.value?.message}>
          <Input id="value" inputMode="decimal" placeholder="0" {...register("value")} />
        </Field>
        <Field label="Stage" htmlFor="stage" error={errors.stage?.message}>
          <Select id="stage" {...register("stage")}>
            <option value="">Choose…</option>
            {stages?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Contact" htmlFor="contact" error={errors.contact?.message}>
          <Controller
            control={control}
            name="contact"
            render={({ field }) => (
              <AsyncPicker<Contact>
                id="contact"
                endpoint="/contacts/"
                value={field.value}
                initialLabel={deal?.contact_name ?? ""}
                label={contactLabel}
                placeholder="Search contacts…"
                onChange={(id, row) => {
                  field.onChange(id);
                  // Fill the company from the contact when none is chosen yet.
                  if (row?.company && getValues("company") === null) {
                    setValue("company", row.company);
                    setCompanyLabel(row.company_name);
                  }
                }}
              />
            )}
          />
        </Field>
        <Field label="Company" htmlFor="company" error={errors.company?.message}>
          <Controller
            control={control}
            name="company"
            render={({ field }) => (
              <AsyncPicker<Company>
                id="company"
                endpoint="/companies/"
                value={field.value}
                initialLabel={companyLabel}
                label={(c) => c.name}
                placeholder="Search companies…"
                onChange={(id) => field.onChange(id)}
              />
            )}
          />
        </Field>
        <Field label="Expected close date" htmlFor="expected_close_date" error={errors.expected_close_date?.message}>
          <Input id="expected_close_date" type="date" {...register("expected_close_date")} />
        </Field>
        {manager && (
          <Field label="Owner" htmlFor="owner" error={errors.owner?.message}>
            <OwnerSelect id="owner" {...register("owner")} />
          </Field>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {deal ? "Save changes" : "Create deal"}
        </Button>
      </div>
    </form>
  );
}
