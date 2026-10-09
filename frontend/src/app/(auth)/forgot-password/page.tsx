"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Field, Input } from "@/components/ui";
import { api } from "@/lib/api/client";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z.object({ email: z.string().email("Enter a valid email address") });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await api("/auth/password-reset/", { method: "POST", body: values, noAuthRedirect: true });
      setSent(true);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["email"]));
    }
  });

  if (sent) {
    return (
      <div className="space-y-4 text-sm text-slate-600">
        <h1 className="text-base font-semibold text-slate-900">Check your email</h1>
        <p>If an account exists for that address, we&apos;ve sent a link to reset your password.</p>
        <Link href="/login" className="text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-base font-semibold text-slate-900">Reset your password</h1>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
      </Field>
      <Button type="submit" className="w-full" loading={isSubmitting}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-indigo-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
