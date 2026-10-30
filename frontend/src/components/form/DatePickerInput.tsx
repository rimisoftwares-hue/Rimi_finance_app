import React, { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { cn } from '../lib/utils';

export interface DatePickerInputProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  containerClassName?: string;
  className?: string;
  disabled?: boolean;
}

const parseDateString = (dateStr?: string): Date | undefined => {
  if (!dateStr || typeof dateStr !== 'string') return undefined;
  const parts = dateStr.trim().split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day);
    }
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? undefined : fallback;
};

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  label,
  value,
  onChange,
  error,
  placeholder = 'Select date',
  required = false,
  containerClassName,
  className,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const selectedDate = parseDateString(value);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(format(date, 'yyyy-MM-dd'));
      setOpen(false);
    } else {
      onChange('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange('');
  };

  return (
    <div className={cn('w-full', containerClassName)}>
      <label className="input-label">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'input-field flex items-center justify-between text-left font-normal transition-all',
              !value && 'text-muted-foreground',
              error && 'input-error',
              disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
          >
            <span className="flex items-center truncate">
              <CalendarIcon className="w-4 h-4 mr-2 text-primary shrink-0" />
              {selectedDate ? format(selectedDate, 'dd-MM-yyyy') : placeholder}
            </span>
            {value && !disabled && (
              <span
                role="button"
                tabIndex={0}
                className="p-1 hover:bg-muted rounded-full ml-1"
                onClick={handleClear}
                title="Clear date"
              >
                <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50 bg-popover" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={handleSelect}
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};
