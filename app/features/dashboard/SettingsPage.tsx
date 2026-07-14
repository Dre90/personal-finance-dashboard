import { useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { Check, Copy, Download, Trash2 } from "lucide-react";
import { Modal, PageHeader } from "../../components/ui";
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
import {
  changeBudgetPayday,
  deleteDashboard,
  exportDashboard,
  updateDashboard,
} from "~/features/dashboard/server";
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

function dayAfter(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function dayBefore(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

function nextPaydayAfter(date: string, payday: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const result = new Date(Date.UTC(year!, month! - 1, 1));
  if (day! >= payday) result.setUTCMonth(result.getUTCMonth() + 1);
  result.setUTCDate(payday);
  return result.toISOString().slice(0, 10);
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("nb-NO", { dateStyle: "long" }).format(
    new Date(`${date}T00:00:00`),
  );
}

export function SettingsPage() {
  const { id, dashboard, refetch } = useDashboard();
  const navigate = useNavigate();
  const toast = useToast();
  const { preference, setPreference } = useTheme();
  const [name, setName] = React.useState(dashboard.name);
  const [payday, setPayday] = React.useState(String(dashboard.payday));
  const [copied, setCopied] = React.useState(false);
  const [deleteConfirm, setDeleteConfirm] = React.useState("");
  const [paydayTransitionOpen, setPaydayTransitionOpen] = React.useState(false);

  React.useEffect(() => {
    setName(dashboard.name);
    setPayday(String(dashboard.payday));
  }, [dashboard.name, dashboard.payday]);

  const renameMutation = useMutation({
    fn: () => updateDashboard({ data: { dashboardId: id, name: name.trim() } }),
    onSuccess: async () => {
      await refetch();
      toast.push("Navn lagret", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const paydayMutation = useMutation({
    fn: () => updateDashboard({ data: { dashboardId: id, payday: Number(payday) } }),
    onSuccess: async () => {
      await refetch();
      toast.push("Lønningsdag lagret", "success");
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
          <Button variant="outline" onClick={copyId}>
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
          <CardTitle>Budsjettperiode</CardTitle>
          <CardDescription>
            {dashboard.hasBudgetPeriods
              ? "Lønningsdagen er låst for den eksisterende budsjettplanen. Ved jobbskifte kan du opprette en kontrollert overgang til en ny lønningsdag."
              : "Velg lønningsdag før du oppretter din første budsjettperiode. Nye perioder starter på lønningsdagen og avsluttes dagen før neste lønningsdag."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="payday">Lønningsdag</FieldLabel>
            <Input
              id="payday"
              type="number"
              min="1"
              max="28"
              value={payday}
              onChange={(e) => setPayday(e.target.value)}
              className="max-w-32"
              disabled={dashboard.hasBudgetPeriods}
            />
          </Field>
          <Button
            onClick={() => void paydayMutation.mutate(undefined)}
            disabled={
              paydayMutation.loading ||
              dashboard.hasBudgetPeriods ||
              !/^(?:[1-9]|1\d|2[0-8])$/.test(payday) ||
              Number(payday) === dashboard.payday
            }
          >
            {paydayMutation.loading ? "Lagrer…" : "Lagre lønningsdag"}
          </Button>
          {dashboard.hasBudgetPeriods && (
            <Button variant="outline" onClick={() => setPaydayTransitionOpen(true)}>
              Bytt lønningsdag
            </Button>
          )}
        </CardContent>
      </Card>

      {dashboard.lastBudgetPeriodEndDate && (
        <PaydayTransitionModal
          open={paydayTransitionOpen}
          onClose={() => setPaydayTransitionOpen(false)}
          dashboardId={id}
          currentPayday={dashboard.payday}
          lastPeriodEndDate={dashboard.lastBudgetPeriodEndDate}
          onChanged={async () => {
            await refetch();
            setPaydayTransitionOpen(false);
            toast.push("Lønningsdagen er endret", "success");
          }}
        />
      )}

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

function PaydayTransitionModal({
  open,
  onClose,
  dashboardId,
  currentPayday,
  lastPeriodEndDate,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  currentPayday: number;
  lastPeriodEndDate: string;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [payday, setPayday] = React.useState(String(currentPayday));
  const [effectiveFrom, setEffectiveFrom] = React.useState(() =>
    nextPaydayAfter(lastPeriodEndDate, currentPayday),
  );
  React.useEffect(() => {
    if (!open) return;
    setPayday(String(currentPayday));
    setEffectiveFrom(nextPaydayAfter(lastPeriodEndDate, currentPayday));
  }, [open, currentPayday, lastPeriodEndDate]);

  const nextPayday = Number(payday);
  const transitionStart = dayAfter(lastPeriodEndDate);
  const mutation = useMutation({
    fn: () =>
      changeBudgetPayday({
        data: { dashboardId, payday: nextPayday, effectiveFrom },
      }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  const validPayday = /^(?:[1-9]|1\d|2[0-8])$/.test(payday) && nextPayday !== currentPayday;
  const validDate =
    effectiveFrom >= transitionStart && Number(effectiveFrom.slice(8, 10)) === nextPayday;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bytt lønningsdag"
      footer={
        <>
          <Button size="lg" variant="outline" disabled={mutation.loading} onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!validPayday || !validDate || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            Opprett overgang
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-muted-foreground text-sm">
          Historiske perioder endres ikke. Appen lager én overgangsperiode før den nye lønningsdagen
          blir aktiv.
        </p>
        <Field>
          <FieldLabel htmlFor="transition-payday">Ny lønningsdag</FieldLabel>
          <Input
            id="transition-payday"
            type="number"
            min="1"
            max="28"
            value={payday}
            onChange={(event) => {
              const value = event.target.value;
              setPayday(value);
              const numericValue = Number(value);
              if (/^(?:[1-9]|1\d|2[0-8])$/.test(value)) {
                setEffectiveFrom(nextPaydayAfter(lastPeriodEndDate, numericValue));
              }
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="transition-effective-from">Første nye lønningsdag</FieldLabel>
          <Input
            id="transition-effective-from"
            type="date"
            min={transitionStart}
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </Field>
        {validPayday && validDate && (
          <p className="text-muted-foreground text-sm">
            Overgangsperioden blir {formatDate(transitionStart)} til{" "}
            {formatDate(dayBefore(effectiveFrom))}.
          </p>
        )}
      </div>
    </Modal>
  );
}
