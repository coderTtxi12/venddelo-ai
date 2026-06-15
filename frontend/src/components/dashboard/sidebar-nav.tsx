"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid,
  Megaphone,
  Settings,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "menu", label: "Menú", icon: LayoutGrid },
  { href: "promotions", label: "Promociones", icon: Megaphone },
  { href: "orders", label: "Pedidos", icon: ShoppingBag },
  { href: "settings", label: "Publicar", icon: Settings },
] as const;

function NavLinks({
  restaurantId,
  pathname,
  layout,
}: {
  restaurantId: string;
  pathname: string;
  layout: "vertical" | "horizontal";
}) {
  const base = `/dashboard/${restaurantId}`;

  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const path = `${base}/${href}`;
        const active = pathname === path || pathname.startsWith(`${path}/`);
        return (
          <Link
            key={href}
            href={path}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius)] font-medium transition-colors duration-200",
              layout === "vertical" && "px-3 py-2.5 text-sm",
              layout === "horizontal" && "px-3 py-2 text-xs sm:text-sm",
              active
                ? "bg-[var(--primary-soft)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:bg-[var(--primary-soft)]/60 hover:text-[var(--text)]",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </>
  );
}

export function SidebarNav({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string;
  restaurantName: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden h-full flex-col border-r border-[var(--border-subtle)] bg-[var(--surface)] lg:flex">
        <div className="border-b border-[var(--border-subtle)] px-5 py-6">
          <div className="flex items-center gap-2 text-[var(--primary)]">
            <Sparkles className="h-5 w-5" aria-hidden />
            <span className="text-sm font-semibold tracking-wide">Vendelo AI</span>
          </div>
          <h2 className="mt-3 font-display text-xl font-semibold leading-tight">
            {restaurantName}
          </h2>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Dashboard">
          <NavLinks restaurantId={restaurantId} pathname={pathname} layout="vertical" />
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface)] lg:hidden">
        <div className="flex items-center gap-2 px-4 py-3">
          <Sparkles className="h-4 w-4 text-[var(--primary)]" aria-hidden />
          <span className="font-display truncate text-sm font-semibold">{restaurantName}</span>
        </div>
        <nav
          className="flex gap-1 overflow-x-auto px-3 pb-3"
          aria-label="Dashboard"
        >
          <NavLinks restaurantId={restaurantId} pathname={pathname} layout="horizontal" />
        </nav>
      </div>
    </>
  );
}
