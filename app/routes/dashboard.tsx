import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { DashboardProvider } from "../lib/dashboard-context";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <DashboardProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </DashboardProvider>
  );
}
