import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, CustomComponents } from "react-day-picker";

import { cn } from "../lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const calendarComponents: Partial<CustomComponents> = {
    Chevron: ({ orientation }) =>
      orientation === "left" ? (
        <ChevronLeft className="h-5 w-5" />
      ) : (
        <ChevronRight className="h-5 w-5" />
      ),
  };

  const today = new Date();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout="dropdown"
      startMonth={new Date(today.getFullYear() - 10, 0)}
      endMonth={new Date(today.getFullYear() + 10, 11)}
      className={cn("rdp", className)}
      classNames={{
        root: "rdp-root",
        months: "rdp-months",
        month: "rdp-month",
        month_caption: "rdp-month_caption",
        caption_label: "rdp-caption_label",
        nav: "rdp-nav",
        button_previous: "rdp-button_previous",
        button_next: "rdp-button_next",
        month_grid: "rdp-month_grid",
        weekdays: "rdp-weekdays",
        weekday: "rdp-weekday",
        week: "rdp-week",
        day: "rdp-day",
        day_button: "rdp-day_button",
        selected: "rdp-selected",
        today: "rdp-today",
        outside: "rdp-outside",
        disabled: "rdp-disabled",
        hidden: "rdp-hidden",
        range_start: "rdp-range_start",
        range_end: "rdp-range_end",
        range_middle: "rdp-range_middle",
        dropdowns: "rdp-dropdowns",
        dropdown_root: "rdp-dropdown_root",
        dropdown: "rdp-dropdown",
        chevron: "rdp-chevron",
        ...classNames,
      }}
      components={calendarComponents}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
