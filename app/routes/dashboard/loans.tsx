import { createFileRoute } from "@tanstack/react-router";
import { LoansPage } from "~/features/loans/LoansPage";

export const Route = createFileRoute("/dashboard/loans")({
  component: LoansPage,
});
