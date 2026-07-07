import { createFileRoute } from "@tanstack/react-router";
import { BudgetPage } from "~/features/budget/BudgetPage";

export const Route = createFileRoute("/dashboard/budget")({
  component: BudgetPage,
});
