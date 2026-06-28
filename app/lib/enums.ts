import { z } from "zod";

export const CATEGORY_KINDS = ["income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];
export const categoryKindSchema = z.enum(CATEGORY_KINDS);

export const ASSET_KINDS = ["ask", "pension", "cash", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const assetKindSchema = z.enum(ASSET_KINDS);

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  ask: "ASK",
  pension: "Pensjon",
  cash: "Kontanter / sparekonto",
  other: "Annet",
};

export const CATEGORY_KIND_LABEL: Record<CategoryKind, string> = {
  income: "Inntekt",
  expense: "Utgift",
};
