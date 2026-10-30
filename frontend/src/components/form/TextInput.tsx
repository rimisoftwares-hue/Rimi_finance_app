import React from 'react';
import { cn } from '../lib/utils';
import { formatCasing, InputCasing } from '../common/CapitalizedInput';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  containerClassName?: string;
  casing?: InputCasing;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  error,
  containerClassName,
  className,
  casing = 'none',
  onChange,
  type = 'text',
  ...props
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (casing && casing !== 'none' && (type === 'text' || !type)) {
      const input = e.currentTarget;
      const formatted = formatCasing(input.value, casing);
      if (formatted !== input.value) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = formatted;
        if (start !== null && end !== null) {
          try {
            input.setSelectionRange(start, end);
          } catch (_) {}
        }
      }
    }
    if (onChange) {
      onChange(e);
    }
  };

  return (
    <div className={cn('w-full', containerClassName)}>
      <label className="input-label">{label}</label>
      <input
        type={type}
        className={cn('input-field', error && 'input-error', className)}
        onChange={handleChange}
        {...props}
      />
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};
