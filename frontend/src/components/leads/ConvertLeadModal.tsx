"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Field, Input, Modal, Select, useToast } from "@/components/ui";
import { useStages } from "@/hooks/useLookups";
import { post } from "@/lib/api/client";
import type { Lead } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z.object({
  create_deal: z.boolean(),
  deal_title: z.string().max(200),
  deal_value: z.string().regex(/^(\d{1,10}(\.\d{1,2})?)?$/, "Enter an amount"),
  stage: z.string(),
  expected_close_date: z.string(),
});
type Values = z.infer<typeof schema>;
export interface ConvertResult {
  contact: number;
  company: number | null;
  deal: number | null;
}

interface Props {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onConverted: (r: ConvertResult) => void;
}

export function ConvertLeadModal(props: Props) {
  const { open, onClose, lead } = props;
  // Modal renders its children only while open, so the form mounts fresh (with its
  // default values) every time; no reset effect that could wipe early keystrokes.
  return (
    <Modal open={open} onClose={onClose} title={`Convert “${lead.name}”`}>
      <ConvertLeadForm {...props} />
    </Modal>
  );
}

function ConvertLeadForm({ lead, onClose, onConverted }: Props) {
  const { data: stages } = useStages();
  const openStages = stages?.filter((s) => !s.is_won && !s.is_lost) ?? [];
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      create_deal: true,
      deal_title: `${lead.company_name || lead.name} deal`,
      deal_value: String(Number(lead.estimated_value)),
      stage: "",
      expected_close_date: "",
    },
  });
  const createDeal = watch("create_deal");

  const convert = useMutation({
    mutationFn: (v: Values) =>
      post<ConvertResult>(`/leads/${lead.id}/convert/`, {
        create_deal: v.create_deal,
        ...(v.create_deal && {
          deal_title: v.deal_title,
          deal_value: v.deal_value || "0",
          ...(v.stage && { stage: Number(v.stage) }),
          ...(v.expected_close_date && { expected_close_date: v.expected_close_date }),
        }),
      }),
    onSuccess: (r) => {
      ["leads", "contacts", "companies", "deals"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      toast("Lead converted");
      onConverted(r);
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, Object.keys(schema.shape))),
  });

  return (
    <form onSubmit={handleSubmit((v) => convert.mutate(v))} className="space-y-4" noValidate>
      <p className="text-sm text-slate-600">
        Creates a contact{lead.company_name ? ` and links the company “${lead.company_name}”` : ""}, then marks this
        lead as Converted.
      </p>
      {formError && <Alert>{formError}</Alert>}
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" className="rounded" {...register("create_deal")} />
        Also create a deal
      </label>
      {createDeal && (
        <div className="space-y-4 rounded-md bg-slate-50 p-4">
          <Field label="Deal title" htmlFor="deal_title" error={errors.deal_title?.message}>
            <Input id="deal_title" {...register("deal_title")} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Value (USD)" htmlFor="deal_value" error={errors.deal_value?.message}>
              <Input id="deal_value" inputMode="decimal" {...register("deal_value")} />
            </Field>
            <Field label="Stage" htmlFor="stage" error={errors.stage?.message}>
              <Select id="stage" {...register("stage")}>
                <option value="">First open stage</option>
                {openStages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Expected close date" htmlFor="expected_close_date" error={errors.expected_close_date?.message}>
            <Input id="expected_close_date" type="date" {...register("expected_close_date")} />
          </Field>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={convert.isPending}>
          Convert lead
        </Button>
      </div>
    </form>
  );
}
