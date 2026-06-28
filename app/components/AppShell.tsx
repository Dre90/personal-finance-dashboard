import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { cn } from "../lib/utils";
import { clearStoredDashboardId } from "../lib/auth";
import { useDashboard } from "../lib/dashboard-context";
import { clearQueryCache } from "../lib/query";

const NAV = [
  { to: "/dashboard", label: "Forside" },
  { to: "/dashboard/budget", label: "Budsjett" },
  { to: "/dashboard/budget/yearly", label: "Årsoversikt" },
  { to: "/dashboard/sinking-funds", label: "Sinking funds" },
  { to: "/dashboard/assets", label: "Formue" },
  { to: "/dashboard/loans", label: "Lån" },
  { to: "/dashboard/recap", label: "Recap" },
  { to: "/dashboard/settings", label: "Innstillinger" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { id, dashboard } = useDashboard();
  const [copied, setCopied] = React.useState(false);

  function handleLogout() {
    clearStoredDashboardId();
    clearQueryCache();
    void router.navigate({ to: "/" });
  }

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-app bg-soft/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-5 py-3 flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-lg">
            <Logo className="w-8 h-8" />
            <span>Økonomi</span>
            <span className="text-sm font-normal text-muted ml-2 hidden md:inline">
              — {dashboard.name}
            </span>
          </Link>
          <nav className="hidden lg:flex items-center gap-1 ml-4 overflow-x-auto">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} label={item.label} />
            ))}
          </nav>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button
              onClick={copyId}
              title="Kopier ID"
              className="text-xs text-muted font-mono hover:text-text px-2 py-1 rounded-md hover:bg-surface-2 transition-colors"
            >
              {copied ? "✓ kopiert" : `ID: ${id.slice(0, 8)}…`}
            </button>
            <button onClick={handleLogout} className="btn btn-ghost text-xs">
              Logg ut
            </button>
          </div>
        </div>
        <nav className="lg:hidden border-t border-app px-3 py-2 flex gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} label={item.label} />
          ))}
        </nav>
      </header>
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-5 py-6">{children}</main>
      <footer className="border-t border-app py-4 text-center text-xs text-muted">
        Husk å ta vare på dashboard-ID-en din — det er din eneste nøkkel.
      </footer>
    </div>
  );
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/dashboard" }}
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
        "text-muted hover:text-text hover:bg-surface-2",
      )}
      activeProps={{
        className: "bg-surface-2 text-text",
      }}
    >
      {label}
    </Link>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#lg)" />
      <path
        d="M14 46 L26 30 L34 38 L50 18"
        stroke="white"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
