"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert, Button, Field, Input } from "@/components/ui";
import { useLogin, useMe } from "@/hooks/useAuth";
import { applyServerErrors, zodResolver } from "@/lib/forms";

const schema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
type Values = z.infer<typeof schema>;

/** Only allow same-site relative redirects. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { data: me } = useMe();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      router.replace(next);
    } catch (err) {
      setFormError(applyServerErrors(err, setError, ["username", "password"]));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <h1 className="text-base font-semibold text-slate-900">Sign in</h1>
      {formError && <Alert>{formError}</Alert>}
      <Field label="Username" htmlFor="username" error={errors.username?.message}>
        <Input id="username" autoComplete="username" autoFocus {...register("username")} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
      </Field>
      <Button type="submit" className="w-full" loading={login.isPending}>
        Sign in
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-indigo-600 hover:underline">
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
