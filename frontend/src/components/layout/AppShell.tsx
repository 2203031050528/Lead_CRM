"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { cx } from "@/components/ui";
import { useLogout, useMe } from "@/hooks/useAuth";

import { GlobalSearch } from "./GlobalSearch";
import { Icon, NAV } from "./nav";
import { NotificationBell } from "./NotificationBell";

const COLLAPSE_KEY = "crm.sidebar.collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const { data: user } = useMe();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));
  const sidebar = (mobile: boolean) => (
    <nav className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-slate-200 px-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-sm font-bold text-white">L</span>
        {(!collapsed || mobile) && <span className="font-semibold text-slate-900">Lead CRM</span>}
      </div>
      <ul className="flex-1 space-y-1 p-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed && !mobile ? item.label : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
                  active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <Icon d={item.icon} />
                {(!collapsed || mobile) && item.label}
              </Link>
            </li>
          );
        })}
      </ul>
      {!mobile && (
        <button
          onClick={toggle}
          className="m-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Icon d={collapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"} />
          {!collapsed && "Collapse"}
        </button>
      )}
    </nav>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside
        className={cx(
          "sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-white transition-[width] md:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        {sidebar(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">{sidebar(true)}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Icon d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <UserMenu />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function UserMenu() {
  const { data: user } = useMe();
  const logout = useLogout();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!user) return null;
  const initials = (user.first_name?.[0] ?? user.username[0]) + (user.last_name?.[0] ?? "");
  const roleLabel = { admin: "Admin", manager: "Manager", rep: "Sales Rep" }[user.role];
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md p-1.5 hover:bg-slate-100"
        aria-label="User menu"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold uppercase text-indigo-700">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-medium leading-tight text-slate-800">{user.full_name}</span>
          <span className="block text-xs leading-tight text-slate-500">{roleLabel}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          <Link href="/account" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Account &amp; password
          </Link>
          <button
            onClick={() => logout.mutate()}
            className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
