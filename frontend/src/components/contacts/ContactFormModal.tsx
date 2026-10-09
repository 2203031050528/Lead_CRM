"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { AsyncPicker } from "@/components/data/AsyncPicker";
import { OwnerSelect } from "@/components/data/OwnerSelect";
import { Alert, Button, Field, Input, Modal, useToast } from "@/components/ui";
import { canManage, useMe } from "@/hooks/useAuth";
import { patch, post } from "@/lib/api/client";
import type { Company, Contact } from "@/lib/api/types";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(100),
  last_name: z.string().trim().max(100),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
  phone: z.string().trim().max(30, "Too long"),
  job_title: z.string().trim().max(100),
  company: z.number().nullable(),
  owner: z.string(),
});
type Values = z.infer<typeof schema>;

const toValues = (c?: Contact | null, meId?: number, companyId?: number | null): Values => ({
  first_name: c?.first_name ?? "",
  last_name: c?.last_name ?? "",
  email: c?.email ?? "",
  phone: c?.phone ?? "",
  job_title: c?.job_title ?? "",
  company: c?.company ?? companyId ?? null,
  owner: String(c?.owner ?? meId ?? ""),
});

interface Props {
  open: boolean;
  onClose: () => void;
  contact?: Contact | null;
  /** Pre-select a company (when adding from a company page). */
  company?: Pick<Company, "id" | "name"> | null;
  onSaved?: (c: Contact) => void;
}

export function ContactFormModal(props: Props) {
  const { open, onClose, contact } = props;
  // Modal renders its children only while open, so the form mounts fresh (with its
  // default values) every time; no reset effect that could wipe early keystrokes.
  return (
    <Modal open={open} onClose={onClose} title={contact ? "Edit contact" : "New contact"} wide>
      <ContactForm {...props} />
    </Modal>
  );
}

function ContactForm({ onClose, contact, company, onSaved }: Props) {
  const { data: me } = useMe();
  const manager = canManage(me?.role);
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, control, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(contact, me?.id, company?.id),
  });

  const save = useMutation({
    mutationFn: (v: Values) => {
      const { owner, ...rest } = v;
      const body = { ...rest, ...(manager && owner && { owner: Number(owner) }) };
      return contact ? patch<Contact>(`/contacts/${contact.id}/`, body) : post<Contact>("/contacts/", body);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
      toast(contact ? "Contact updated" : "Contact created");
      onSaved?.(saved);
      onClose();
    },
    onError: (err) => setFormError(applyServerErrors(err, setError, Object.keys(schema.shape))),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      {formError && <Alert>{formError}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="first_name" error={errors.first_name?.message}>
          <Input id="first_name" autoFocus {...register("first_name")} />
        </Field>
        <Field label="Last name" htmlFor="last_name" error={errors.last_name?.message}>
          <Input id="last_name" {...register("last_name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" {...register("email")} />
        </Field>
        <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register("phone")} />
        </Field>
        <Field label="Job title" htmlFor="job_title" error={errors.job_title?.message}>
          <Input id="job_title" {...register("job_title")} />
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
                initialLabel={contact?.company_name || company?.name || ""}
                label={(c) => c.name}
                onChange={(id) => field.onChange(id)}
                placeholder="Search companies…"
              />
            )}
          />
        </Field>
        {manager && (
          <Field label="Owner" htmlFor="owner" error={errors.owner?.message}>
            <OwnerSelect id="owner" {...register("owner")} />
          </Field>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" loading={save.isPending}>{contact ? "Save changes" : "Create contact"}</Button>
      </div>
    </form>
  );
}
