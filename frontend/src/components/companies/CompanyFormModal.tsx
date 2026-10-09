"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Alert, Button, Field, Input, Modal, Textarea, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { patch, post } from "@/lib/api/client";
import type { Company } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  website: z.union([z.literal(""), z.string().trim().url("Enter a full URL, e.g. https://example.com")]),
  industry: z.string().trim().max(100),
  phone: z.string().trim().max(30, "Too long"),
  address: z.string().trim(),
  owner: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (c?: Company | null, meId?: number): Values => ({
  name: c?.name ?? "",
  website: c?.website ?? "",
  industry: c?.industry ?? "",
  phone: c?.phone ?? "",
  address: c?.address ?? "",
  owner: String(c?.owner ?? meId ?? ""),
});

interface Props {
  open: boolean;
  onClose: () => void;
  company?: Company | null;
  onSaved?: (c: Company) => void;
}

export function CompanyFormModal(props: Props) {
  const { open, onClose, company } = props;
  // Modal renders its children only while open, so the form mounts fresh (with its
  // default values) every time; no reset effect that could wipe early keystrokes.
  return (
    <Modal open={open} onClose={onClose} title={company ? "Edit company" : "New company"} wide>
      <CompanyForm {...props} />
    </Modal>
  );
}

function CompanyForm({ onClose, company, onSaved }: Props) {
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(company, me?.id),
  });

  const save = useMutation({
    mutationFn: (v: Values) => {
      const { owner, ...rest } = v;
      const body = { ...rest, ...(manager && owner && { owner: Number(owner) }) };
      return company ? patch<Company>(`/companies/${company.id}/`, body) : post<Company>("/companies/", body);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast(company ? "Company updated" : "Company created");
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, Object.keys(schema.shape))),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoFocus {...register("name")} />
        </Field>
        <Field label="Industry" htmlFor="industry" error={errors.industry?.message}>
          <Input id="industry" {...register("industry")} />
        </Field>
        <Field label="Website" htmlFor="website" error={errors.website?.message}>
          <Input id="website" type="url" placeholder="https://" {...register("website")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </Field>
        {manager && (
          <Field label="Owner" htmlFor="owner" error={errors.owner?.message}>
            <OwnerSelect id="owner" {...register("owner")} />
          </Field>
        )}
      </div>
      <Field label="Address" htmlFor="address" error={errors.address?.message}>
        <Textarea id="address" rows={3} {...register("address")} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{company ? "Save changes" : "Create company"}</Button>
      </div>
    </form>
  );
}
