import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[var(--surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex cursor-pointer items-center gap-2 text-[var(--text)]">
          <Sparkles className="h-5 w-5 text-[var(--primary)]" aria-hidden />
          <span className="font-display text-lg font-semibold">Vendelo AI</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden cursor-pointer text-sm font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text)] sm:inline"
          >
            Iniciar sesión
          </Link>
          <Link href="/login">
            <Button size="sm">Empezar gratis</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
