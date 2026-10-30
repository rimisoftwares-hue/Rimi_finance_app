import * as React from 'react';
import { cn } from '../lib/utils';
import { LucideIcon } from 'lucide-react';

export type InputCasing = 'words' | 'upper' | 'lower' | 'none';

export interface CapitalizedInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  /**
   * Casing style:
   * - 'words': First letter capitalized & capitalized after every space/punctuation (e.g. "John Doe")
   * - 'upper': All uppercase (e.g. "EMP001", "TN01AB1234")
   * - 'lower': All lowercase (e.g. "user@example.com")
   * - 'none': Raw input without automatic transformation
   * @default 'words'
   */
  casing?: InputCasing;
  /** Label text displayed above the input */
  label?: string;
  /** Optional icon displayed beside the label or inside input */
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  /** Error message displayed below input */
  error?: string;
  /** Container div className */
  containerClassName?: string;
  /** Callback returning the formatted string directly */
  onValueChange?: (value: string) => void;
  /** Standard React onChange handler */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * Formats a string according to the specified casing rule
 */
export const formatCasing = (text: string, casing: InputCasing = 'words'): string => {
  if (!text || typeof text !== 'string') return text || '';

  switch (casing) {
    case 'upper':
      return text.toUpperCase();

    case 'lower':
      return text.toLowerCase();

    case 'words':
      // Capitalize first character and any letter preceded by whitespace, period, hyphen, comma, slash or quote
      return text.replace(/(?:^|[\s.\-\/,'])([a-z\u00E0-\u00FC])/g, (match) =>
        match.toUpperCase()
      );

    case 'none':
    default:
      return text;
  }
};

/**
 * Reusable input text field component supporting:
 * 1. Title/Words capitalization (First letter caps & caps after space)
 * 2. Full uppercase (All Caps)
 * 3. Lowercase
 * 4. Preserved cursor position during typing
 */
export const CapitalizedInput = React.forwardRef<HTMLInputElement, CapitalizedInputProps>(
  (
    {
      casing = 'words',
      label,
      icon: Icon,
      error,
      containerClassName,
      className,
      value,
      defaultValue,
      onChange,
      onValueChange,
      type = 'text',
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    // Merge external ref with internal inputRef
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputEl = e.currentTarget;
      const rawValue = inputEl.value;

      // Only apply casing transformations for text-like inputs when casing is enabled
      const shouldTransform =
        casing !== 'none' && (type === 'text' || type === 'search' || !type);

      const formatted = shouldTransform ? formatCasing(rawValue, casing) : rawValue;

      if (formatted !== rawValue) {
        const cursorStart = inputEl.selectionStart;
        const cursorEnd = inputEl.selectionEnd;

        inputEl.value = formatted;

        // Restore cursor position so it doesn't jump to the end
        if (cursorStart !== null && cursorEnd !== null) {
          try {
            inputEl.setSelectionRange(cursorStart, cursorEnd);
          } catch (_) {}
        }
      }

      if (onChange) {
        onChange(e);
      }

      if (onValueChange) {
        onValueChange(formatted);
      }
    };

    const inputElement = (
      <input
        ref={inputRef}
        type={type}
        value={value}
        defaultValue={defaultValue}
        onChange={handleChange}
        className={cn(
          'w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground text-sm',
          'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors',
          'placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed',
          error && 'border-destructive focus:ring-destructive',
          className
        )}
        {...props}
      />
    );

    // If no label or error is provided, return just the input
    if (!label && !error && !Icon) {
      return inputElement;
    }

    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label className="block text-sm font-medium text-card-foreground mb-2 flex items-center gap-1.5">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span>{label}</span>
          </label>
        )}
        {inputElement}
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
    );
  }
);

CapitalizedInput.displayName = 'CapitalizedInput';

export const Input = CapitalizedInput;
export type InputProps = CapitalizedInputProps;

export default CapitalizedInput;
