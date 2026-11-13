import React, { useId } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

const EMPTY_VALUE_SENTINEL = '__APP_SELECT_EMPTY__';

export interface AppSelectOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface AppSelectGroup<T extends string = string> {
  label: string;
  options: AppSelectOption<T>[];
}

export interface AppSelectProps<T extends string = string> {
  value: T;
  onValueChange: (val: T) => void;
  options: AppSelectOption<T>[];
  groups?: AppSelectGroup<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  size?: 'sm' | 'md';
  label?: string;
  required?: boolean;
  error?: string;
  labelClassName?: string;
  containerClassName?: string;
  id?: string;
  name?: string;
}

export function AppSelect<T extends string = string>({
  value,
  onValueChange,
  options,
  groups,
  placeholder = 'Select option',
  disabled = false,
  className = '',
  triggerClassName = '',
  size = 'md',
  label,
  required,
  error,
  labelClassName,
  containerClassName,
  id,
  name,
}: AppSelectProps<T>) {
  const generatedId = useId();
  const hasFieldMeta = Boolean(label || error || id);
  const selectId = id || (hasFieldMeta ? `app-select-${generatedId}` : undefined);
  const errorId = error && selectId ? `${selectId}-error` : undefined;

  const heightClass = size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm';
  const strValue = value === undefined || value === null ? '' : String(value);
  const normalizedValue = strValue === '' ? EMPTY_VALUE_SENTINEL : strValue;
  const errorClass = error ? ' input-error border-destructive focus:ring-destructive' : '';
  const wrapperClass = containerClassName !== undefined ? containerClassName : className;

  const renderOption = (opt: AppSelectOption<T>) => {
    const optStr = opt.value === undefined || opt.value === null ? '' : String(opt.value);
    const itemVal = optStr === '' ? EMPTY_VALUE_SENTINEL : optStr;
    return (
      <SelectItem
        key={itemVal}
        value={itemVal}
        disabled={opt.disabled}
        className="text-xs sm:text-sm cursor-pointer"
      >
        <div className="flex items-center gap-2">
          {opt.icon}
          <span>{opt.label}</span>
        </div>
      </SelectItem>
    );
  };

  return (
    <div className={wrapperClass}>
      {label && (
        <label
          htmlFor={selectId}
          className={labelClassName || 'input-label mb-2'}
        >
          {label}
          {required && !label.trim().endsWith('*') && (
            <span className="text-destructive ml-0.5">*</span>
          )}
        </label>
      )}
      <Select
        value={normalizedValue}
        onValueChange={(val) =>
          onValueChange((val === EMPTY_VALUE_SENTINEL ? '' : val) as T)
        }
        disabled={disabled}
        name={name}
      >
        <SelectTrigger
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className={`bg-background border-input text-foreground hover:bg-secondary/30 transition-colors ${heightClass} ${triggerClassName}${errorClass}`}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border max-h-60 overflow-y-auto z-50">
          {groups && groups.length > 0
            ? groups.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel className="text-xs text-muted-foreground">
                    {group.label}
                  </SelectLabel>
                  {group.options.map(renderOption)}
                </SelectGroup>
              ))
            : options.map(renderOption)}
        </SelectContent>
      </Select>
      {error && (
        <p id={errorId} className="error-message">
          {error}
        </p>
      )}
    </div>
  );
}


