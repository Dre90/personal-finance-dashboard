import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { AppShell } from "../components/AppShell";
import { getDashboard } from "../server/api";
import { getStoredDashboardId, clearStoredDashboardId } from "../lib/auth";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: DashboardLayout,
});

function DashboardLayout() {
  const navigate = useNavigate();
  const [dashboardName, setDashboardName] = React.useState<string | undefined>();
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const id = getStoredDashboardId();
    if (!id) {
      navigate({ to: "/" });
      return;
    }
    getDashboard({ data: { dashboardId: id } })
      .then((dash) => {
        if (!dash) {
          clearStoredDashboardId();
          navigate({ to: "/" });
          return;
        }
        setDashboardName(dash.name);
        setReady(true);
      })
      .catch(() => {
        clearStoredDashboardId();
        navigate({ to: "/" });
      });
  }, [navigate]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[color:var(--color-muted)]">
        Laster…
      </div>
    );
  }

  return (
    <AppShell dashboardName={dashboardName}>
      <Outlet />
    </AppShell>
  );
}
