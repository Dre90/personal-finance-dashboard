import * as React from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Wallet,
  CalendarRange,
  Files,
  PiggyBank,
  TrendingUp,
  Landmark,
  ChartColumnBig,
  Settings,
  Copy,
  Check,
  LogOut,
} from "lucide-react";
import { clearStoredDashboardId } from "~/lib/auth";
import { useDashboard } from "~/lib/dashboard-context";
import { clearQueryCache } from "~/lib/query";
import { Separator } from "~/components/ui/separator";
import { Toaster } from "~/components/ui/sonner";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType;
  /** Match the route exactly (used for parents whose path prefixes a sibling). */
  exact?: boolean;
}

const NAV: ReadonlyArray<NavItem> = [
  { to: "/dashboard", label: "Forside", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/budget", label: "Budsjett", icon: Wallet, exact: true },
  { to: "/dashboard/sinking-funds", label: "Sinking funds", icon: PiggyBank },
  { to: "/dashboard/assets", label: "Formue", icon: TrendingUp },
  { to: "/dashboard/loans", label: "Lån", icon: Landmark },
  { to: "/dashboard/recap", label: "Recap", icon: ChartColumnBig },
  { to: "/dashboard/settings", label: "Innstillinger", icon: Settings },
];

const BUDGET_NAV: ReadonlyArray<NavItem> = [
  { to: "/dashboard/budget/templates", label: "Maler", icon: Files },
  { to: "/dashboard/budget/yearly", label: "Årsoversikt", icon: CalendarRange },
];

const PAGE_NAV = [...NAV, ...BUDGET_NAV];

function matchesRoute(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
          <CurrentPageTitle />
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
      <Toaster />
    </SidebarProvider>
  );
}

function CurrentPageTitle() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = [...PAGE_NAV].reverse().find((n) => matchesRoute(n, pathname));
  return <span className="text-sm font-medium">{current?.label ?? "Dashboard"}</span>;
}

function AppSidebar() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
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
    <Sidebar>
      <SidebarHeader>
        <Link to="/dashboard" className="flex items-center gap-2 px-1 py-1.5">
          <Logo className="size-7 shrink-0" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="text-sm font-semibold">Økonomi</span>
            <span className="text-muted-foreground truncate text-xs">{dashboard.name}</span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigasjon</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.to}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        isActive={
                          item.to === "/dashboard/budget"
                            ? pathname.startsWith(item.to)
                            : matchesRoute(item, pathname)
                        }
                        tooltip={item.label}
                        render={<Link to={item.to} />}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {item.to === "/dashboard/budget" && (
                      <SidebarMenuSub>
                        {BUDGET_NAV.map((child) => (
                          <SidebarMenuSubItem key={child.to}>
                            <SidebarMenuSubButton
                              isActive={matchesRoute(child, pathname)}
                              render={<Link to={child.to} />}
                            >
                              {child.label}
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </React.Fragment>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={copyId} tooltip="Kopier dashboard-ID">
              {copied ? <Check /> : <Copy />}
              <span className="truncate font-mono">
                {copied ? "Kopiert!" : `ID: ${id.slice(0, 8)}…`}
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} tooltip="Logg ut">
              <LogOut />
              <span>Logg ut</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
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
