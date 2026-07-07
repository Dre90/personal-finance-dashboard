import { createFileRoute } from "@tanstack/react-router";
import { YearlyBudgetPage } from "~/features/budget/YearlyBudgetPage";

export const Route = createFileRoute("/dashboard/budget_/yearly")({
  component: YearlyBudgetPage,
});
