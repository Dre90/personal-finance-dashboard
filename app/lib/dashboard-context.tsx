import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Dashboard } from "../../db/schema";
import { getDashboard } from "../server/api";
import { clearStoredDashboardId, getStoredDashboardId } from "./auth";
import { clearQueryCache, useQuery } from "./query";

export interface DashboardContextValue {
  /** Stable dashboard id, guaranteed non-null inside the dashboard layout. */
  id: string;
  dashboard: Dashboard;
  refetch: () => Promise<Dashboard | null | undefined>;
}

const DashboardContext = React.createContext<DashboardContextValue | null>(null);

/**
 * Provider that:
 *  1. Reads the dashboard id from localStorage on the client.
 *  2. Loads the dashboard record from the server.
 *  3. Redirects to the landing page if either step fails.
 *
 * Children only render once the dashboard is verified — every child can
 * therefore call `useDashboard()` without null-checks.
 */
export function DashboardProvider({
  children,
  loadingFallback,
}: {
  children: React.ReactNode;
  loadingFallback?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [id, setId] = React.useState<string | null>(null);
  const [ready, setReady] = React.useState(false);

  // Read the stored id once on mount (client only).
  React.useEffect(() => {
    const stored = getStoredDashboardId();
    if (!stored) {
      void navigate({ to: "/" });
      return;
    }
    setId(stored);
    setReady(true);
  }, [navigate]);

  const query = useQuery({
    key: ["dashboard", id],
    fn: () => getDashboard({ data: { dashboardId: id! } }),
    enabled: ready && id !== null,
  });

  // If the dashboard id is stale (deleted on server), bounce to landing.
  React.useEffect(() => {
    if (!ready) return;
    if (query.error || (query.data === null && !query.loading)) {
      clearStoredDashboardId();
      clearQueryCache();
      void navigate({ to: "/" });
    }
  }, [ready, query.data, query.loading, query.error, navigate]);

  if (!id || !query.data) {
    return <>{loadingFallback ?? <FullPageLoader />}</>;
  }

  const value: DashboardContextValue = {
    id,
    dashboard: query.data,
    refetch: query.refetch,
  };
  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

/** Access the current dashboard. Must be used inside `<DashboardProvider>`. */
export function useDashboard(): DashboardContextValue {
  const ctx = React.useContext(DashboardContext);
  if (!ctx) {
    throw new Error("useDashboard() must be used inside <DashboardProvider>");
  }
  return ctx;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted">
      Laster…
    </div>
  );
}
