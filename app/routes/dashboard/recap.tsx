import { createFileRoute } from "@tanstack/react-router";
import { RecapPage } from "~/features/recap/RecapPage";

export const Route = createFileRoute("/dashboard/recap")({
  component: RecapPage,
});
