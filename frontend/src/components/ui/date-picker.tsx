import * as React from "react";
import { format, isValid } from "date-fns";
import { Calendar as CalendarIcon, X } from "lucide-react";

import { cn } from "../lib/utils";
import { Calendar } from "./calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";

export interface DatePickerProps {
  value?: string | Date | null;
  defaultValue?: string | Date | null;
  onChange?: (e: any) => void;
  onValueChange?: (value: string) => void;
  onSelect?: (date: Date | undefined) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  min?: string | Date;
  max?: string | Date;
  displayFormat?: string;
  align?: "start" | "center" | "end";
  clearable?: boolean;
}

export const parseDatePickerDate = (val?: string | Date | null): Date | undefined => {
  if (!val) return undefined;
  if (val instanceof Date) return isValid(val) ? val : undefined;
  if (typeof val !== "string") return undefined;

  const trimmed = val.trim();
  if (!trimmed) return undefined;

  // Handle YYYY-MM-DD format strictly without timezone shifting
  const ymd = trimmed.split("T")[0];
  const parts = ymd.split("-");
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      const dt = new Date(y, m, d);
      return isValid(dt) ? dt : undefined;
    }
  }

  const fallback = new Date(trimmed);
  return isValid(fallback) ? fallback : undefined;
};

export const DatePicker = React.forwardRef<HTMLButtonElement, DatePickerProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onValueChange,
      onSelect,
      placeholder = "Pick a date",
      className,
      disabled = false,
      readOnly = false,
      required = false,
      id,
      name,
      min,
      max,
      displayFormat = "dd MMM yyyy",
      align = "start",
      clearable = true,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [internalValue, setInternalValue] = React.useState<string | Date | null>(
      defaultValue || ""
    );

    const isControlled = value !== undefined;
    const currentValue = isControlled ? value : internalValue;
    const selectedDate = parseDatePickerDate(currentValue);

    const minDate = React.useMemo(() => parseDatePickerDate(min), [min]);
    const maxDate = React.useMemo(() => parseDatePickerDate(max), [max]);

    const disabledDays = React.useMemo(() => {
      const rules: any[] = [];
      if (minDate) rules.push({ before: minDate });
      if (maxDate) rules.push({ after: maxDate });
      return rules.length > 0 ? rules : undefined;
    }, [minDate, maxDate]);

    const handleSelect = (date: Date | undefined) => {
      const formatted = date ? format(date, "yyyy-MM-dd") : "";
      if (!isControlled) {
        setInternalValue(formatted);
      }

      if (onSelect) {
        onSelect(date);
      }

      if (onValueChange) {
        onValueChange(formatted);
      }

      if (onChange) {
        const syntheticEvent = {
          target: { value: formatted, name: name || "", id: id || "" },
          currentTarget: { value: formatted, name: name || "", id: id || "" },
          preventDefault: () => {},
          stopPropagation: () => {},
          value: formatted,
        };
        onChange(syntheticEvent);
      }
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      handleSelect(undefined);
    };

    return (
      <div className={cn("relative inline-block w-full", className)}>
        {name && (
          <input
            type="hidden"
            name={name}
            id={id ? `${id}-hidden` : undefined}
            value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
            required={required}
          />
        )}
        <Popover open={open} onOpenChange={readOnly || disabled ? undefined : setOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={ref}
              id={id}
              type="button"
              variant="outline"
              disabled={disabled}
              className={cn(
                "w-full justify-start text-left font-normal bg-background h-9 px-3 text-sm",
                !selectedDate && "text-muted-foreground",
                readOnly && "cursor-default opacity-80 pointer-events-none",
                disabled && "opacity-50 cursor-not-allowed",
                className
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">
                {selectedDate && isValid(selectedDate)
                  ? format(selectedDate, displayFormat)
                  : placeholder}
              </span>
              {selectedDate && !disabled && !readOnly && clearable && (
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-auto rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors pointer-events-auto"
                  onClick={handleClear}
                  title="Clear date"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </Button>
          </PopoverTrigger>
          {!readOnly && !disabled && (
            <PopoverContent className="w-auto p-0 z-50 bg-popover" align={align}>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => {
                  handleSelect(d);
                  setOpen(false);
                }}
                disabled={disabledDays}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          )}
        </Popover>
      </div>
    );
  }
);

DatePicker.displayName = "DatePicker";
