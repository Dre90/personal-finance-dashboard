import { Info } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldLabel } from "~/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "~/components/ui/popover";

export function ConsumptionGroupField({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Field orientation="horizontal">
      <Checkbox
        id="is-consumption"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <FieldLabel htmlFor="is-consumption">Dette er Forbruk-gruppen</FieldLabel>
      <Popover>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Hva er Forbruk-gruppen?"
            />
          }
        >
          <Info />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <PopoverHeader>
            <PopoverTitle>Hva er Forbruk?</PopoverTitle>
            <PopoverDescription>
              Poster i denne gruppen får faktiske beløp automatisk fra Forbrukslisten. Når du
              registrerer et kjøp, velger du én av postene her. Derfor kan faktisk beløp ikke
              redigeres direkte i budsjettet.
            </PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
