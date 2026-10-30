import React from 'react';
import { cn } from '../lib/utils';

interface SelectInputProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: { value: string; label: string }[];
  containerClassName?: string;
}

export const SelectInput: React.FC<SelectInputProps> = ({
  label,
  error,
  options,
  containerClassName,
  className,
  ...props
}) => {

  return (
    <div className={cn('w-full', containerClassName)}>
      <label className="input-label">{label}</label>
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
