"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api/client";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z
  .object({
    new_password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Passwords don't match" });
type Values = z.infer<typeof schema>;

function ResetForm() {
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  if (!uid || !token) {
    return (
      <div className="space-y-3 text-sm">
        <Alert>This reset link is incomplete.</Alert>
        <Link href="/forgot-password" className="text-indigo-600 hover:underline">
          Request a new link
        </Link>
      </div>
    );
  }
  if (done) {
    return (
      <div className="space-y-3 text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">Password updated</h1>
        <p>You can now sign in with your new password.</p>
        <Link href="/login" className="text-indigo-600 hover:underline">
          Sign in
        </Link>
      </div>
    );
  }

  const onSubmit = handleSubmit(async ({ new_password }) => {
    setFormError(null);
    try {
      await api("/auth/password-reset/confirm/", {
        method: "POST",
        body: { uid, token, new_password },
        noAuthRedirect: true,
      });
      setDone(true);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["new_password"]));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-base font-semibold text-slate-900">Choose a new password</h1>
      {formError && <Alert>{formError}</Alert>}
      <Field label="New password" htmlFor="new_password" error={errors.new_password?.message}>
        <Input id="new_password" type="password" autoComplete="new-password" {...register("new_password")} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Set password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
