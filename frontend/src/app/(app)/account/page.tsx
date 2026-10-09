"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Card, Field, Input, PageHeader, useToast } from "@/components/ui";
import { useMe } from "@/hooks/useAuth";
import { post } from "@/lib/api/client";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z
  .object({
    old_password: z.string().min(1, "Enter your current password"),
    new_password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type Values = z.infer<typeof schema>;

export default function AccountPage() {
  const { data: user } = useMe();
  const toast = useToast();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async ({ old_password, new_password }) => {
    setFormError(null);
    try {
      await post("/auth/change-password/", { old_password, new_password });
      reset();
      toast("Password changed");
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["old_password", "new_password"]));
    }
  });

  return (
    <>
      <PageHeader title="Account" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Profile</h2>
          <dl className="space-y-3 text-sm">
            {[
              ["Name", user?.full_name],
              ["Username", user?.username],
              ["Email", user?.email || "—"],
              ["Role", { admin: "Admin", manager: "Manager", rep: "Sales Rep" }[user?.role ?? "rep"]],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <dt className="text-slate-500">{k}</dt>
                <dd className="text-right text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Change password</h2>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError && <Alert>{formError}</Alert>}
            <Field label="Current password" htmlFor="old_password" error={errors.old_password?.message}>
              <Input id="old_password" type="password" autoComplete="current-password" {...register("old_password")} />
            </Field>
            <Field label="New password" htmlFor="new_password" error={errors.new_password?.message}>
              <Input id="new_password" type="password" autoComplete="new-password" {...register("new_password")} />
            </Field>
            <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm?.message}>
              <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
            </Field>
            <Button type="submit" loading={isSubmitting}>
              Update password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
}
