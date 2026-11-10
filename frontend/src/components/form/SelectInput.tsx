import React from 'react';
import { cn } from '../lib/utils';

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
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
  ...props
}) => {

  return (
    <div className={cn('w-full', containerClassName)}>
      <label className={cn('input-label mb-2', labelClassName)}>{label}</label>
      <select
        className={cn('input-field', error && 'input-error', className)}
        {...props}
      >
        <option value="">Select...</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};
