import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { DashboardProvider } from "../lib/dashboard-context";
import { ToastProvider } from "../components/Toaster";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <ToastProvider>
      <DashboardProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </DashboardProvider>
    </ToastProvider>
  );
}
