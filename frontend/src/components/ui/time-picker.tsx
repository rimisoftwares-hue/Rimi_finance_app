import * as React from "react";
import { Clock, X, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Button } from "./button";

export interface TimePickerProps {
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (e: any) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  align?: "start" | "center" | "end";
  clearable?: boolean;
  minuteStep?: number;
}

/**
 * Parses "HH:mm" or "HH:mm:ss" (24hr) into { hour12, minute, period }
 */
export const parseTimeString = (timeStr?: string | null) => {
  if (!timeStr || typeof timeStr !== "string") {
    return { hour24: 9, hour12: 9, minute: 0, period: "AM" as "AM" | "PM", isEmpty: true };
  }

  const parts = timeStr.trim().split(":");
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10);
    if (isNaN(h) || h < 0 || h > 23) h = 9;
    if (isNaN(m) || m < 0 || m > 59) m = 0;

    const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return { hour24: h, hour12, minute: m, period, isEmpty: false };
  }

  return { hour24: 9, hour12: 9, minute: 0, period: "AM" as "AM" | "PM", isEmpty: true };
};

/**
 * Converts 12hr parts into 24hr "HH:mm" string
 */
export const formatTo24Hour = (hour12: number, minute: number, period: "AM" | "PM"): string => {
  let h = hour12 % 12;
  if (period === "PM") h += 12;
  const hh = String(h).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm}`;
};

/**
 * Formats "HH:mm" into user-friendly "hh:mm A" (e.g. "09:30 AM")
 */
export const formatToDisplayTime = (timeStr?: string | null): string => {
  if (!timeStr) return "";
  const { hour12, minute, period, isEmpty } = parseTimeString(timeStr);
  if (isEmpty) return "";
  const hh = String(hour12).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${hh}:${mm} ${period}`;
};

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES_5 = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const QUICK_PRESETS = [
  { label: "09:00 AM", value: "09:00" },
  { label: "09:30 AM", value: "09:30" },
  { label: "10:00 AM", value: "10:00" },
  { label: "01:00 PM", value: "13:00" },
  { label: "06:00 PM", value: "18:00" },
  { label: "07:00 PM", value: "19:00" },
  { label: "08:00 PM", value: "20:00" },
];

export const TimePicker = React.forwardRef<HTMLButtonElement, TimePickerProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onValueChange,
      placeholder = "Pick a time",
      className,
      disabled = false,
      readOnly = false,
      required = false,
      id,
      name,
      align = "start",
      clearable = true,
      minuteStep = 5,
    },
    ref
  ) => {
    const [open, setOpen] = React.useState(false);
    const [internalValue, setInternalValue] = React.useState<string>(defaultValue || "");

    const isControlled = value !== undefined;
    const currentValue = isControlled ? (value || "") : internalValue;

    const parsed = React.useMemo(() => parseTimeString(currentValue), [currentValue]);

    // Local selection state inside popup
    const [selectedH12, setSelectedH12] = React.useState<number>(parsed.hour12);
    const [selectedM, setSelectedM] = React.useState<number>(parsed.minute);
    const [selectedPeriod, setSelectedPeriod] = React.useState<"AM" | "PM">(parsed.period);

    // Keep popup local state in sync when currentValue changes
    React.useEffect(() => {
      setSelectedH12(parsed.hour12);
      setSelectedM(parsed.minute);
      setSelectedPeriod(parsed.period);
    }, [currentValue, parsed.hour12, parsed.minute, parsed.period]);

    const emitChange = (newVal: string) => {
      if (!isControlled) {
        setInternalValue(newVal);
      }
      if (onValueChange) {
        onValueChange(newVal);
      }
      if (onChange) {
        const syntheticEvent = {
          target: { value: newVal, name: name || "", id: id || "" },
          currentTarget: { value: newVal, name: name || "", id: id || "" },
          preventDefault: () => {},
          stopPropagation: () => {},
          value: newVal,
        };
        onChange(syntheticEvent);
      }
    };

    const handleApplyTime = (h12: number, m: number, p: "AM" | "PM") => {
      const time24 = formatTo24Hour(h12, m, p);
      setSelectedH12(h12);
      setSelectedM(m);
      setSelectedPeriod(p);
      emitChange(time24);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      emitChange("");
    };

    const handleSetNow = () => {
      const now = new Date();
      let h = now.getHours();
      let m = now.getMinutes();
      // Round to nearest 5 if step is 5
      if (minuteStep === 5) {
        m = Math.round(m / 5) * 5;
        if (m === 60) {
          m = 0;
          h = (h + 1) % 24;
        }
      }
      const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      handleApplyTime(h12, m, period);
    };

    const displayString = currentValue ? formatToDisplayTime(currentValue) : "";

    return (
      <div className={cn("relative inline-block w-full", className)}>
        {name && (
          <input
            type="hidden"
            name={name}
            id={id ? `${id}-hidden` : undefined}
            value={currentValue}
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
                "w-full justify-start text-left font-normal bg-background h-10 px-3 text-sm border-border hover:bg-accent/40 transition-colors",
                !currentValue && "text-muted-foreground",
                readOnly && "cursor-default opacity-80 pointer-events-none",
                disabled && "opacity-50 cursor-not-allowed",
                className
              )}
            >
              <Clock className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">
                {displayString || placeholder}
              </span>

              {currentValue && !disabled && !readOnly && clearable && (
                <span
                  role="button"
                  tabIndex={0}
                  className="ml-auto rounded-full p-0.5 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors pointer-events-auto"
                  onClick={handleClear}
                  title="Clear time"
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </Button>
          </PopoverTrigger>

          {!readOnly && !disabled && (
            <PopoverContent
              className="w-auto p-4 z-50 bg-popover border-border shadow-xl rounded-xl space-y-3.5"
              align={align}
            >
              {/* Top Digital Display Bar */}
              <div className="flex items-center justify-between pb-2.5 border-b border-border">
                <div className="flex items-center gap-1.5 font-mono text-lg font-bold text-foreground">
                  <span className="bg-muted/60 px-2 py-0.5 rounded text-primary">
                    {String(selectedH12).padStart(2, "0")}
                  </span>
                  <span className="text-muted-foreground animate-pulse">:</span>
                  <span className="bg-muted/60 px-2 py-0.5 rounded text-primary">
                    {String(selectedM).padStart(2, "0")}
                  </span>
                  <span className="ml-1 text-xs px-2 py-1 rounded bg-secondary text-secondary-foreground font-sans font-semibold">
                    {selectedPeriod}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground px-2"
                  onClick={handleSetNow}
                >
                  Now
                </Button>
              </div>

              {/* Quick Presets */}
              <div>
                <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                  Quick Picks
                </div>
                <div className="flex flex-wrap gap-1 max-w-[260px]">
                  {QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => {
                        const p = parseTimeString(preset.value);
                        handleApplyTime(p.hour12, p.minute, p.period);
                      }}
                      className={cn(
                        "text-xs px-2 py-1 rounded border transition-colors",
                        currentValue === preset.value
                          ? "bg-primary text-primary-foreground border-primary font-medium"
                          : "bg-muted/40 text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3-Column Picker: Hours, Minutes, AM/PM */}
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
                {/* Hours Column */}
                <div>
                  <div className="text-center text-[11px] font-semibold text-muted-foreground mb-1">
                    Hours
                  </div>
                  <div className="h-44 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {HOURS_12.map((h) => {
                      const isSelected = selectedH12 === h;
                      return (
                        <button
                          key={h}
                          type="button"
                          onClick={() => handleApplyTime(h, selectedM, selectedPeriod)}
                          className={cn(
                            "w-full text-center py-1.5 text-xs rounded-md transition-all font-mono",
                            isSelected
                              ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                              : "hover:bg-accent text-foreground hover:font-medium"
                          )}
                        >
                          {String(h).padStart(2, "0")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Minutes Column */}
                <div>
                  <div className="text-center text-[11px] font-semibold text-muted-foreground mb-1">
                    Mins
                  </div>
                  <div className="h-44 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {MINUTES_5.map((m) => {
                      const isSelected = selectedM === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => handleApplyTime(selectedH12, m, selectedPeriod)}
                          className={cn(
                            "w-full text-center py-1.5 text-xs rounded-md transition-all font-mono",
                            isSelected
                              ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                              : "hover:bg-accent text-foreground hover:font-medium"
                          )}
                        >
                          {String(m).padStart(2, "0")}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* AM / PM Column */}
                <div>
                  <div className="text-center text-[11px] font-semibold text-muted-foreground mb-1">
                    Period
                  </div>
                  <div className="flex flex-col gap-2 pt-2">
                    {(["AM", "PM"] as const).map((p) => {
                      const isSelected = selectedPeriod === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleApplyTime(selectedH12, selectedM, p)}
                          className={cn(
                            "w-full py-2.5 text-xs font-semibold rounded-md border transition-all",
                            isSelected
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted/40 text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                          )}
                        >
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Done Action */}
              <div className="pt-2 border-t border-border flex justify-between items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    emitChange("");
                    setOpen(false);
                  }}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-8 px-4 text-xs font-medium"
                  onClick={() => setOpen(false)}
                >
                  <Check className="h-3.5 w-3.5 mr-1" /> Done
                </Button>
              </div>
            </PopoverContent>
          )}
        </Popover>
      </div>
    );
  }
);

TimePicker.displayName = "TimePicker";
