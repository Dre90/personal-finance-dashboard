import { createFileRoute } from "@tanstack/react-router";
import { AssetsPage } from "~/features/assets/AssetsPage";

export const Route = createFileRoute("/dashboard/assets")({
  component: AssetsPage,
});
