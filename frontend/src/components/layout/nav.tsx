import type { Role } from "@/lib/api/types";

export { Icon } from "@/components/ui/icon";

export interface NavItem {
  href: string;
  label: string;
  icon: string; // SVG path data (24x24, stroke)
  roles?: Role[];
}

export const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/leads", label: "Leads", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1M19 8v6M22 11h-6" },
  { href: "/deals", label: "Deals", icon: "M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" },
  { href: "/contacts", label: "Contacts", icon: "M17 20h5v-1a4 4 0 00-5-3.87M9 20H2v-1a5 5 0 0110 0v1M12 7a3 3 0 11-6 0 3 3 0 016 0zM20 8a2 2 0 11-4 0 2 2 0 014 0z" },
  { href: "/companies", label: "Companies", icon: "M3 21h18M5 21V5l7-2v18M19 21V9l-7-3M9 9h.01M9 13h.01M9 17h.01" },
  { href: "/tasks", label: "Tasks", icon: "M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" },
  { href: "/reports", label: "Reports", icon: "M4 19V5M4 19h16M8 15l3-4 3 2 5-6", roles: ["admin", "manager"] },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z", roles: ["admin"] },
];
