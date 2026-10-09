import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 text-center">
      <p className="text-4xl font-bold text-slate-300">404</p>
      <p className="text-sm text-slate-600">This page doesn&apos;t exist.</p>
      <Link href="/dashboard" className="text-sm text-indigo-600 hover:underline">
        Go to dashboard
      </Link>
    </div>
  );
}
