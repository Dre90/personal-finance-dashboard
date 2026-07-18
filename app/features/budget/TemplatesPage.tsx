import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import {
  ArrowDownUp,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Empty, LoadingPlaceholder, Modal, PageHeader, StatCard } from "~/components/ui";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldError, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useToast } from "~/components/Toaster";
import { ConsumptionGroupField } from "~/features/budget/ConsumptionGroupField";
import { DEFAULT_BUDGET_GROUP_COLOR, GroupColorField } from "~/features/budget/GroupColorField";
import { useDashboard } from "~/lib/dashboard-context";
import { useMutation, useQuery } from "~/lib/query";
import { cn, formatMoneyInput, formatNOK, roundMoney, toNumber } from "~/lib/utils";
import {
  createBudgetTemplate,
  createTemplateGroup,
  createTemplateItem,
  deleteBudgetTemplate,
  deleteTemplateGroup,
  deleteTemplateItem,
  listBudgetTemplates,
  reorderTemplateGroups,
  reorderTemplateItems,
  updateBudgetTemplate,
  updateTemplateGroup,
  updateTemplateItem,
} from "~/features/budget/server";

type Template = Awaited<ReturnType<typeof listBudgetTemplates>>[number];
type TemplateGroup = Template["groups"][number];
type ReorderEntry = { id: number; name: string; value?: number };

const templateItemExpectedSchema = z
  .string()
  .transform((value) => {
    const trimmed = value.trim();
    if (!trimmed) return "0";
    if (trimmed.includes(",")) return trimmed.replace(/[\s.]/g, "").replace(",", ".");
    if (/^-?(?:\d{1,3}\.)+\d{3}$/.test(trimmed)) return trimmed.replace(/[\s.]/g, "");
    return trimmed.replace(/\s/g, "");
  })
  .refine((value) => Number.isFinite(Number(value)), "Skriv et gyldig beløp.");

const templateItemFormSchema = z.object({
  name: z.string().trim().min(1, "Skriv et navn på posten."),
  expected: templateItemExpectedSchema,
});

export function TemplatesPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const [templateOpen, setTemplateOpen] = React.useState(false);
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<TemplateGroup | null>(null);
  const [itemGroup, setItemGroup] = React.useState<TemplateGroup | null>(null);
  const [templateToDelete, setTemplateToDelete] = React.useState<Template | null>(null);
  const [reorderTarget, setReorderTarget] = React.useState<{
    title: string;
    entries: ReorderEntry[];
    canSortByValue?: boolean;
    save: (orderedIds: number[]) => Promise<unknown>;
  } | null>(null);
  const query = useQuery({
    key: ["budget-templates", dashboardId],
    fn: () => listBudgetTemplates({ data: { dashboardId } }),
  });
  const templates = query.data ?? [];
  const template = templates.find((entry) => entry.id === selectedId) ?? templates[0] ?? null;
  const refresh = async (): Promise<void> => {
    await query.refetch();
  };
  const deleteMutation = useMutation({
    fn: (templateId: number) => deleteBudgetTemplate({ data: { dashboardId, templateId } }),
    onSuccess: () => {
      setSelectedId(null);
      void refresh();
    },
    onError: (error) => toast.push(error.message, "error"),
  });

  if (query.isInitialLoading) return <LoadingPlaceholder />;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Budsjettmaler"
        subtitle="Maler brukes når du oppretter en ny budsjettperiode."
        actions={
          <>
            <Button
              size="lg"
              nativeButton={false}
              variant="outline"
              render={<Link to="/dashboard/budget" />}
            >
              <ArrowLeft data-icon="inline-start" />
              Budsjett
            </Button>
            <Button size="lg" onClick={() => setTemplateOpen(true)}>
              <Plus data-icon="inline-start" />
              Ny mal
            </Button>
          </>
        }
      />
      {templates.length === 0 ? (
        <Empty
          title="Ingen maler"
          description="Opprett en mal med inntekter, utgifter og forventede beløp."
          action={
            <Button size="lg" onClick={() => setTemplateOpen(true)}>
              <Plus data-icon="inline-start" />
              Opprett mal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Maler</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {templates.map((entry) => (
                <Button
                  key={entry.id}
                  size="lg"
                  variant={entry.id === template?.id ? "secondary" : "ghost"}
                  className="justify-start"
                  onClick={() => setSelectedId(entry.id)}
                >
                  {entry.name}
                </Button>
              ))}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-4">
            {template && (
              <TemplateEditor
                template={template}
                dashboardId={dashboardId}
                onChanged={refresh}
                onAddGroup={() => setGroupOpen(true)}
                onEditGroup={setEditingGroup}
                onReorderGroups={() =>
                  setReorderTarget({
                    title: "Endre rekkefølge på grupper",
                    entries: template.groups,
                    save: (orderedIds) =>
                      reorderTemplateGroups({
                        data: { dashboardId, templateId: template.id, orderedIds },
                      }),
                  })
                }
                onReorderItems={(group) =>
                  setReorderTarget({
                    title: `Endre rekkefølge i ${group.name}`,
                    entries: group.items.map((item) => ({
                      id: item.id,
                      name: item.name,
                      value: toNumber(item.expected),
                    })),
                    canSortByValue: true,
                    save: (orderedIds) =>
                      reorderTemplateItems({
                        data: { dashboardId, groupId: group.id, orderedIds },
                      }),
                  })
                }
                onDelete={() => setTemplateToDelete(template)}
                onAddItem={setItemGroup}
              />
            )}
          </div>
        </div>
      )}
      <TemplateModal
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        dashboardId={dashboardId}
        onSaved={async (id) => {
          setSelectedId(id);
          setTemplateOpen(false);
          await refresh();
        }}
      />
      <TemplateGroupModal
        open={groupOpen || editingGroup !== null}
        onClose={() => {
          setGroupOpen(false);
          setEditingGroup(null);
        }}
        dashboardId={dashboardId}
        templateId={template?.id ?? 0}
        group={editingGroup}
        onSaved={async () => {
          setGroupOpen(false);
          setEditingGroup(null);
          await refresh();
        }}
      />
      <TemplateItemModal
        open={itemGroup !== null}
        onClose={() => setItemGroup(null)}
        dashboardId={dashboardId}
        group={itemGroup}
        onSaved={async () => {
          setItemGroup(null);
          await refresh();
        }}
      />
      <ReorderTemplateModal
        open={reorderTarget !== null}
        onClose={() => setReorderTarget(null)}
        target={reorderTarget}
        onSaved={async () => {
          setReorderTarget(null);
          await refresh();
        }}
      />
      <DeleteConfirmationDialog
        open={templateToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTemplateToDelete(null);
        }}
        title="Slette malen?"
        description={
          <>
            Malen «{templateToDelete?.name}» og alle gruppene og postene i den blir slettet. Dette
            kan ikke angres.
          </>
        }
        busy={deleteMutation.loading}
        onConfirm={() => {
          if (!templateToDelete) return;
          deleteMutation.mutate(templateToDelete.id);
          setTemplateToDelete(null);
        }}
        confirmLabel="Slett mal"
      />
    </div>
  );
}

function TemplateEditor({
  template,
  dashboardId,
  onChanged,
  onAddGroup,
  onEditGroup,
  onReorderGroups,
  onReorderItems,
  onDelete,
  onAddItem,
}: {
  template: Template;
  dashboardId: string;
  onChanged: () => Promise<void>;
  onAddGroup: () => void;
  onEditGroup: (group: TemplateGroup) => void;
  onReorderGroups: () => void;
  onReorderItems: (group: TemplateGroup) => void;
  onDelete: () => void;
  onAddItem: (group: TemplateGroup) => void;
}) {
  const toast = useToast();
  const [name, setName] = React.useState(template.name);
  React.useEffect(() => setName(template.name), [template.id, template.name]);
  const renameMutation = useMutation({
    fn: () => updateBudgetTemplate({ data: { dashboardId, templateId: template.id, name } }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  const totals = template.groups.reduce(
    (summary, group) => {
      const expected = group.items.reduce((sum, item) => sum + toNumber(item.expected), 0);
      if (group.kind === "income") summary.income += expected;
      else summary.expense += expected;
      return summary;
    },
    { income: 0, expense: 0 },
  );
  const expectedBalance = roundMoney(totals.income - totals.expense);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{template.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="template-name">Navn på mal</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="template-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                size="lg"
                disabled={!name.trim() || name === template.name || renameMutation.loading}
                onClick={() => renameMutation.mutate(undefined)}
              >
                Lagre
              </Button>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2">
            {template.groups.length > 1 && (
              <Button size="lg" variant="outline" onClick={onReorderGroups}>
                <ArrowDownUp data-icon="inline-start" />
                Sortér grupper
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={onAddGroup}>
              <Plus data-icon="inline-start" />
              Legg til gruppe
            </Button>
            <Button size="lg" variant="destructive" onClick={onDelete}>
              <Trash2 data-icon="inline-start" />
              Slett mal
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Forventede inntekter" value={totals.income} tone="positive" />
        <StatCard label="Forventede utgifter" value={totals.expense} tone="warn" />
        <StatCard
          label="Forventet balanse"
          value={expectedBalance}
          tone={expectedBalance === 0 ? "positive" : "negative"}
          hint={expectedBalance === 0 ? "Alt er fordelt" : "Må fordeles for et nullbudsjett"}
        />
      </div>
      {template.groups.map((group) => (
        <TemplateGroupEditor
          key={group.id}
          group={group}
          dashboardId={dashboardId}
          onChanged={onChanged}
          onEditGroup={() => onEditGroup(group)}
          onReorderItems={() => onReorderItems(group)}
          onAddItem={() => onAddItem(group)}
        />
      ))}
    </>
  );
}

function TemplateGroupEditor({
  group,
  dashboardId,
  onChanged,
  onEditGroup,
  onReorderItems,
  onAddItem,
}: {
  group: TemplateGroup;
  dashboardId: string;
  onChanged: () => Promise<void>;
  onEditGroup: () => void;
  onReorderItems: () => void;
  onAddItem: () => void;
}) {
  const toast = useToast();
  const [deleteTarget, setDeleteTarget] = React.useState<
    { type: "group"; name: string } | { type: "item"; id: number; name: string } | null
  >(null);
  const deleteGroup = useMutation({
    fn: () => deleteTemplateGroup({ data: { dashboardId, groupId: group.id } }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  const updateItem = useMutation({
    fn: ({ itemId, name, expected }: { itemId: number; name?: string; expected?: string }) =>
      updateTemplateItem({ data: { dashboardId, itemId, name, expected } }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  const deleteItem = useMutation({
    fn: (itemId: number) => deleteTemplateItem({ data: { dashboardId, itemId } }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {group.name}
            {group.isConsumption ? " · Forbruk" : ""}
          </span>
          <div className="flex gap-1">
            <Button variant="ghost" size="lg" onClick={onEditGroup}>
              <Pencil data-icon="inline-start" />
              Endre gruppe
            </Button>
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setDeleteTarget({ type: "group", name: group.name })}
            >
              <Trash2 data-icon="inline-start" />
              Slett gruppe
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead className="text-right">Forventet</TableHead>
                <TableHead aria-label="Handlinger" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Input
                      key={`name-${item.id}-${item.name}`}
                      defaultValue={item.name}
                      aria-label={`Navn på ${item.name}`}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value === item.name.trim()) return;
                        updateItem.mutate({ itemId: item.id, name: value });
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="text"
                      inputMode="decimal"
                      key={`${item.id}-${item.expected}`}
                      defaultValue={formatMoneyInput(item.expected)}
                      className="ml-auto w-32 text-right tabular-nums"
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value === formatMoneyInput(item.expected)) return;
                        updateItem.mutate({ itemId: item.id, expected: value });
                      }}
                      aria-label={`Forventet for ${item.name}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`Slett ${item.name}`}
                      onClick={() =>
                        setDeleteTarget({ type: "item", id: item.id, name: item.name })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-muted-foreground text-sm">
            Sum: {formatNOK(group.items.reduce((sum, item) => sum + toNumber(item.expected), 0))}
          </span>
          <div className="flex gap-2">
            {group.items.length > 1 && (
              <Button size="lg" variant="outline" onClick={onReorderItems}>
                <ArrowDownUp data-icon="inline-start" />
                Sortér poster
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={onAddItem}>
              <Plus data-icon="inline-start" />
              Legg til post
            </Button>
          </div>
        </div>
        <DeleteConfirmationDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
          title={deleteTarget?.type === "group" ? "Slette gruppen?" : "Slette posten?"}
          description={
            deleteTarget?.type === "group" ? (
              <>Gruppen «{deleteTarget.name}» og alle postene i den blir slettet.</>
            ) : (
              <>Posten «{deleteTarget?.name}» blir slettet fra malen.</>
            )
          }
          busy={deleteGroup.loading || deleteItem.loading}
          onConfirm={() => {
            if (!deleteTarget) return;
            if (deleteTarget.type === "group") deleteGroup.mutate(undefined);
            else deleteItem.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }}
          confirmLabel={deleteTarget?.type === "group" ? "Slett gruppe" : "Slett post"}
        />
      </CardContent>
    </Card>
  );
}

function TemplateModal({
  open,
  onClose,
  dashboardId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  onSaved: (id: number) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const mutation = useMutation({
    fn: () => createBudgetTemplate({ data: { dashboardId, name } }),
    onSuccess: (template) => {
      setName("");
      void onSaved(template.id);
    },
    onError: (error) => toast.push(error.message, "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ny budsjettmal"
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!name.trim() || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            Opprett
          </Button>
        </>
      }
    >
      <Field>
        <FieldLabel htmlFor="new-template-name">Navn</FieldLabel>
        <Input
          id="new-template-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="For eksempel Normalmåned"
        />
      </Field>
    </Modal>
  );
}

function TemplateGroupModal({
  open,
  onClose,
  dashboardId,
  templateId,
  group,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  templateId: number;
  group: TemplateGroup | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = React.useState(group?.name ?? "");
  const [kind, setKind] = React.useState<"income" | "expense">(
    (group?.kind as "income" | "expense" | undefined) ?? "expense",
  );
  const [isConsumption, setIsConsumption] = React.useState(group?.isConsumption ?? false);
  const [color, setColor] = React.useState(group?.color ?? DEFAULT_BUDGET_GROUP_COLOR);
  React.useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setKind((group?.kind as "income" | "expense" | undefined) ?? "expense");
    setIsConsumption(group?.isConsumption ?? false);
    setColor(group?.color ?? DEFAULT_BUDGET_GROUP_COLOR);
  }, [group, open]);
  const mutation = useMutation({
    fn: async () => {
      if (group) {
        await updateTemplateGroup({
          data: { dashboardId, groupId: group.id, name, isConsumption, color },
        });
        return;
      }
      await createTemplateGroup({
        data: { dashboardId, templateId, name, kind, isConsumption, color },
      });
    },
    onSuccess: () => {
      setName("");
      setIsConsumption(false);
      setColor(DEFAULT_BUDGET_GROUP_COLOR);
      void onSaved();
    },
    onError: (error) => toast.push(error.message, "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? "Endre gruppe" : "Ny gruppe i mal"}
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!name.trim() || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            {group ? "Lagre" : "Legg til"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="template-group-name">Navn</FieldLabel>
          <Input
            id="template-group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {!group && (
          <Field>
            <FieldLabel htmlFor="template-group-kind">Type</FieldLabel>
            <select
              id="template-group-kind"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={kind}
              onChange={(event) => {
                const next = event.target.value as "income" | "expense";
                setKind(next);
                if (next === "income") setIsConsumption(false);
              }}
            >
              <option value="income">Inntekt</option>
              <option value="expense">Utgift</option>
            </select>
          </Field>
        )}
        {kind === "expense" && (
          <ConsumptionGroupField checked={isConsumption} onCheckedChange={setIsConsumption} />
        )}
        <GroupColorField color={color} onColorChange={setColor} />
      </div>
    </Modal>
  );
}

function TemplateItemModal({
  open,
  onClose,
  dashboardId,
  group,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  group: TemplateGroup | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const mutation = useMutation({
    fn: ({ name, expected }: z.infer<typeof templateItemFormSchema>) => {
      if (!group) throw new Error("Velg gruppe");
      return createTemplateItem({ data: { dashboardId, groupId: group.id, name, expected } });
    },
    onSuccess: () => {
      void onSaved();
    },
    onError: (error) => toast.push(error.message, "error"),
  });
  const form = useForm({
    defaultValues: { name: "", expected: "" },
    validators: { onSubmit: templateItemFormSchema },
    onSubmit: ({ value }) => mutation.mutate(value),
  });
  React.useEffect(() => {
    if (open) form.reset();
  }, [form, open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ny post i ${group?.name ?? "gruppe"}`}
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button size="lg" disabled={mutation.loading} onClick={() => form.handleSubmit()}>
            Legg til
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <form.Field name="name">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="template-item-name">Navn</FieldLabel>
                <Input
                  id="template-item-name"
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="expected">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="template-item-expected">Forventet beløp</FieldLabel>
                <Input
                  id="template-item-expected"
                  name={field.name}
                  type="text"
                  inputMode="decimal"
                  value={field.state.value}
                  onBlur={() => {
                    field.handleBlur();
                    const parsed = templateItemExpectedSchema.safeParse(field.state.value);
                    if (parsed.success) field.handleChange(formatMoneyInput(parsed.data));
                  }}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
                <p className="text-muted-foreground text-xs">Tomt beløp lagres som 0,00 kr.</p>
              </Field>
            );
          }}
        </form.Field>
      </div>
    </Modal>
  );
}

function ReorderTemplateModal({
  open,
  onClose,
  target,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  target: {
    title: string;
    entries: ReorderEntry[];
    canSortByValue?: boolean;
    save: (orderedIds: number[]) => Promise<unknown>;
  } | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [order, setOrder] = React.useState<ReorderEntry[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!open || !target) return;
    setOrder(target.entries);
    setDragIndex(null);
    setOverIndex(null);
  }, [open, target]);

  const move = (index: number, delta: -1 | 1) => {
    const next = [...order];
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= next.length) return;
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    setOrder(next);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry!);
    setOrder(next);
  };

  const isChanged = order.some((entry, index) => entry.id !== target?.entries[index]?.id);
  const sortByName = (direction: "asc" | "desc") => {
    setOrder((current) =>
      [...current].sort((a, b) =>
        direction === "asc"
          ? a.name.localeCompare(b.name, "nb")
          : b.name.localeCompare(a.name, "nb"),
      ),
    );
  };
  const sortByValue = (direction: "asc" | "desc") => {
    setOrder((current) =>
      [...current].sort((a, b) => {
        const difference = (a.value ?? 0) - (b.value ?? 0);
        return direction === "asc" ? difference : -difference;
      }),
    );
  };
  const saveMutation = useMutation({
    fn: () => {
      if (!target) throw new Error("Ingen rekkefølge å lagre");
      return target.save(order.map((entry) => entry.id));
    },
    onSuccess: () => void onSaved(),
    onError: (error) => toast.push(error.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target?.title ?? "Endre rekkefølge"}
      footer={
        <>
          <Button
            type="button"
            size="lg"
            variant="ghost"
            className="mr-auto"
            disabled={!isChanged || saveMutation.loading}
            onClick={() => target && setOrder(target.entries)}
          >
            Tilbakestill
          </Button>
          <Button size="lg" variant="outline" disabled={saveMutation.loading} onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!isChanged || saveMutation.loading}
            onClick={() => saveMutation.mutate(undefined)}
          >
            Lagre
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="lg" onClick={() => sortByName("asc")}>
          A–Å
        </Button>
        <Button type="button" variant="outline" size="lg" onClick={() => sortByName("desc")}>
          Å–A
        </Button>
        {target?.canSortByValue && (
          <>
            <Button type="button" variant="outline" size="lg" onClick={() => sortByValue("asc")}>
              Sum lav–høy
            </Button>
            <Button type="button" variant="outline" size="lg" onClick={() => sortByValue("desc")}>
              Sum høy–lav
            </Button>
          </>
        )}
      </div>
      <p className="text-muted-foreground mt-3 text-xs">
        Dra radene for å sortere, eller bruk pilene.
      </p>
      <ul className="mt-3 max-h-96 overflow-auto">
        {order.map((entry, index) => {
          const isDragged = dragIndex === index;
          const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <li
              key={entry.id}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", String(entry.id));
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overIndex !== index) setOverIndex(index);
              }}
              onDragLeave={() => {
                if (overIndex === index) setOverIndex(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) moveTo(dragIndex, index);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "flex cursor-grab items-center gap-3 rounded px-2 py-2 select-none active:cursor-grabbing",
                isDragged ? "opacity-40" : "hover:bg-muted",
                isOver && "ring-primary ring-2",
              )}
            >
              <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
              {target?.canSortByValue && (
                <span className="text-muted-foreground tabular-nums">
                  {formatNOK(entry.value ?? 0)}
                </span>
              )}
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Flytt ${entry.name} opp`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Flytt ${entry.name} ned`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDown />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
