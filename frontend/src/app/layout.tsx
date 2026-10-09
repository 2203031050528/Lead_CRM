import type { Metadata } from "next";
import "./globals.css";

import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Lead CRM",
  description: "Lightweight lead management CRM",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
