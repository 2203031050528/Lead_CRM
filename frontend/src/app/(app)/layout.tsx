"use client";

import { Suspense } from "react";

import { AppShell } from "@/components/layout/AppShell";
import { AuthGuard } from "@/components/layout/AuthGuard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>
        {/* Pages read ?id= and filters via useSearchParams, which static export requires inside Suspense. */}
        <Suspense>{children}</Suspense>
      </AppShell>
    </AuthGuard>
  );
}
