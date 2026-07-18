import { Field, FieldLabel } from "~/components/ui/field";
import { CHART_COLORS } from "~/lib/colors";
import { cn } from "~/lib/utils";

export const DEFAULT_BUDGET_GROUP_COLOR = CHART_COLORS[0];

export function GroupColorField({
  color,
  onColorChange,
}: {
  color: string;
  onColorChange: (color: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>Farge</FieldLabel>
      <div className="flex flex-wrap gap-2">
        {CHART_COLORS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onColorChange(option)}
            className={cn(
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none size-7 rounded-full border-2",
              color === option ? "border-foreground" : "border-transparent",
            )}
            style={{ backgroundColor: option }}
            aria-label={`Farge ${option}`}
            aria-pressed={color === option}
          />
        ))}
      </div>
    </Field>
  );
}
