"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { Button, Skeleton } from "@/components/ui";
import { useMe } from "@/hooks/useAuth";
import type { Role } from "@/lib/api/types";

/** Client-side guard: every app page is a static shell that only renders once /auth/me succeeds. */
export function AuthGuard({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { data: user, isLoading, isError, refetch } = useMe();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user === null) {
      const next = encodeURIComponent(pathname + window.location.search);
      router.replace(`/login?next=${next}`);
    }
  }, [isLoading, user, pathname, router]);

  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-sm text-slate-600">
        <p>Can&apos;t reach the server.</p>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden w-60 border-r border-slate-200 bg-white p-4 md:block">
          <Skeleton className="mb-6 h-6 w-24" />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="mb-3 h-5 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="mb-4 h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (roles && !roles.includes(user.role)) {
    return <Forbidden />;
  }
  return <>{children}</>;
}

export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { data: user } = useMe();
  if (!user) return null;
  return roles.includes(user.role) ? <>{children}</> : <Forbidden />;
}

function Forbidden() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold text-slate-900">You don&apos;t have access to this page</p>
      <p className="mt-1 text-sm text-slate-500">Ask an administrator if you think this is a mistake.</p>
    </div>
  );
}
