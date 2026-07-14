import { createFileRoute } from "@tanstack/react-router";
import { TemplatesPage } from "~/features/budget/TemplatesPage";

export const Route = createFileRoute("/dashboard/budget_/templates")({
  component: TemplatesPage,
});
