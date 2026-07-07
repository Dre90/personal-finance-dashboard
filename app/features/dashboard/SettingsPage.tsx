import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Check, Copy, Download, Trash2 } from "lucide-react";
import { PageHeader } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Field, FieldLabel } from "../../components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { deleteDashboard, exportDashboard, updateDashboard } from "~/features/dashboard/server";
import { useDashboard } from "../../lib/dashboard-context";
import { clearQueryCache, useMutation } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { clearStoredDashboardId } from "../../lib/auth";
import { useTheme } from "../../lib/theme-context";
import type { ThemePreference } from "../../lib/theme";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "light", label: "Lyst" },
  { value: "dark", label: "Mørkt" },
];

export function SettingsPage() {
  const { id, dashboard, refetch } = useDashboard();
  const navigate = useNavigate();
  const toast = useToast();
  const { preference, setPreference } = useTheme();
  const [name, setName] = React.useState(dashboard.name);
  const [copied, setCopied] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");

  React.useEffect(() => {
    setName(dashboard.name);
  }, [dashboard.name]);

  const renameMutation = useMutation({
    fn: () => updateDashboard({ data: { dashboardId: id, name: name.trim() } }),
    onSuccess: async () => {
      await refetch();
      toast.push("Navn lagret", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const exportMutation = useMutation({
    fn: () => exportDashboard({ data: { dashboardId: id } }),
    onSuccess: (dump) => {
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `okonomi-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.push("Eksportert", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteMutation = useMutation({
    fn: () => deleteDashboard({ data: { dashboardId: id } }),
    onSuccess: () => {
      clearStoredDashboardId();
      clearQueryCache();
      void navigate({ to: "/" });
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  async function copyId() {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const canRename = name.trim().length > 0 && name.trim() !== dashboard.name;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Innstillinger" />

      <Card>
        <CardHeader>
          <CardTitle>Dashboard-ID</CardTitle>
          <CardDescription>
            Denne ID-en er din eneste nøkkel. Lagre den et trygt sted — det finnes ingen recovery.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="bg-muted/40 rounded-lg border p-3 font-mono text-sm break-all">{id}</div>
          <Button variant="outline" size="sm" onClick={copyId}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Kopiert" : "Kopier ID"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Navn</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field>
            <FieldLabel htmlFor="dashboard-name">Navn på dashboardet</FieldLabel>
            <Input id="dashboard-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button
            onClick={() => void renameMutation.mutate(undefined)}
            disabled={renameMutation.loading || !canRename}
          >
            {renameMutation.loading ? "Lagrer…" : "Lagre navn"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Utseende</CardTitle>
          <CardDescription>
            Velg tema. «Auto» følger systeminnstillingen din. Lagres på denne enheten.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ToggleGroup
            variant="outline"
            value={[preference]}
            onValueChange={(vals) => {
              const v = vals[0] as ThemePreference | undefined;
              if (v) setPreference(v);
            }}
          >
            {THEME_OPTIONS.map((opt) => (
              <ToggleGroupItem key={opt.value} value={opt.value}>
                {opt.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Eksporter data</CardTitle>
          <CardDescription>
            Last ned alle dataene som JSON. God idé å gjøre dette med jevne mellomrom som backup.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => void exportMutation.mutate(undefined)}
            disabled={exportMutation.loading}
          >
            <Download />
            {exportMutation.loading ? "Eksporterer…" : "Last ned JSON"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Faresone</CardTitle>
          <CardDescription>
            Slett hele dashboardet og alle dataene permanent. Kan ikke angres.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog onOpenChange={() => setDeleteConfirm("")}>
            <AlertDialogTrigger
              render={
                <Button variant="destructive">
                  <Trash2 />
                  Slett dashboard for alltid
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Slette dashboardet permanent?</AlertDialogTitle>
                <AlertDialogDescription>
                  Dette sletter ALT permanent og kan ikke angres. Skriv <strong>SLETT</strong> for å
                  bekrefte.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="SLETT"
                autoFocus
              />
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  disabled={deleteConfirm !== "SLETT" || deleteMutation.loading}
                  onClick={() => void deleteMutation.mutate(undefined)}
                >
                  {deleteMutation.loading ? "Sletter…" : "Slett for alltid"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
