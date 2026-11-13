import React from 'react';
import { cn } from '../lib/utils';
import { AppSelect } from '../common/AppSelect';

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  containerClassName?: string;
  labelClassName?: string;
}

export const SelectInput: React.FC<SelectInputProps> = ({
  label,
  error,
  options,
  containerClassName,
  labelClassName,
  className,
  value,
  defaultValue,
  onChange,
  disabled,
  required,
  name,
  id,
}) => {
  const hasEmptyOption = options.some((opt) => String(opt.value) === '');
  const normalizedOptions = hasEmptyOption
    ? options.map((opt) => ({
        value: String(opt.value),
        label: opt.label,
        disabled: opt.disabled,
      }))
    : [
        { value: '', label: 'Select...' },
        ...options.map((opt) => ({
          value: String(opt.value),
          label: opt.label,
          disabled: opt.disabled,
        })),
      ];

  const emptyOptLabel =
    normalizedOptions.find((opt) => opt.value === '')?.label || 'Select an option';

  const currentValue =
    value !== undefined && value !== null
      ? String(value)
      : defaultValue !== undefined && defaultValue !== null
        ? String(defaultValue)
        : '';

  const handleValueChange = (val: string) => {
    if (!onChange) return;
    const syntheticEvent = {
      target: { value: val, name: name || '' },
      currentTarget: { value: val, name: name || '' },
      preventDefault: () => {},
      stopPropagation: () => {},
    } as unknown as React.ChangeEvent<HTMLSelectElement>;
    onChange(syntheticEvent);
  };

  return (
    <AppSelect
      id={id}
      name={name}
      label={label}
      required={required}
      error={error}
      value={currentValue}
      onValueChange={handleValueChange}
      options={normalizedOptions}
      placeholder={emptyOptLabel}
      disabled={disabled}
      containerClassName={cn('w-full', containerClassName)}
      labelClassName={cn('input-label mb-2', labelClassName)}
      triggerClassName={cn(
        'w-full h-[42px] px-4 py-2.5 rounded-lg text-sm',
        className
      )}
    />
  );
};

