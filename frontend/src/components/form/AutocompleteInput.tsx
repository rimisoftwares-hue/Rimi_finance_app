// components/AutocompleteInput.tsx
import React, { useState, useRef, useEffect, useId } from 'react';
import { Search, Check, X, Plus } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AutocompleteInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: any) => void;
  suggestions: any[];
  loading?: boolean;
  error?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  containerClassName?: string;
  disabled?: boolean;
  onAddNew?: (query: string) => void;
  addNewText?: string;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  label,
  value,
  onChange,
  onSelect,
  suggestions,
  loading = false,
  error,
  placeholder,
  required = false,
  className = '',
  containerClassName = '',
  disabled = false,
  onAddNew,
  addNewText = 'Add Vehicle',
}) => {
  const generatedId = useId();
  const inputId = `autocomplete-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Reset active index when suggestions change
  useEffect(() => {
    setActiveIndex(-1);
  }, [suggestions]);

  // Auto-scroll highlighted suggestion into view
  useEffect(() => {
    if (showSuggestions && activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }, [activeIndex, showSuggestions]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowSuggestions(newValue.length > 0);
    setActiveIndex(-1);
  };

  const handleSelect = (item: any) => {
    onChange(item.vehicle_number);
    if (onSelect) {
      onSelect(item);
    }
    setShowSuggestions(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const clearInput = () => {
    onChange('');
    setShowSuggestions(false);
    setActiveIndex(-1);
    if (onSelect) {
      onSelect(null);
    }
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showSuggestions && value.length > 0) {
        setShowSuggestions(true);
        setActiveIndex(0);
      } else if (suggestions.length > 0) {
        setActiveIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!showSuggestions && value.length > 0) {
        setShowSuggestions(true);
        setActiveIndex(suggestions.length - 1);
      } else if (suggestions.length > 0) {
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
      }
    } else if (e.key === 'Enter') {
      if (showSuggestions && activeIndex >= 0 && activeIndex < suggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        handleSelect(suggestions[activeIndex]);
      } else if (showSuggestions && suggestions.length === 0 && onAddNew && value) {
        e.preventDefault();
        e.stopPropagation();
        onAddNew(value);
        setShowSuggestions(false);
        setActiveIndex(-1);
      } else if (showSuggestions) {
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    } else if (e.key === 'Escape') {
      if (showSuggestions) {
        e.preventDefault();
        e.stopPropagation();
        setShowSuggestions(false);
        setActiveIndex(-1);
      }
    } else if (e.key === 'Tab') {
      setShowSuggestions(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={cn('relative', containerClassName)} ref={containerRef}>
      <label
        htmlFor={inputId}
        className="block text-xs sm:text-sm font-medium text-foreground mb-1.5"
      >
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => {
            setIsFocused(true);
            if (value.length > 0) {
              setShowSuggestions(true);
            }
          }}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listboxId}
          aria-activedescendant={
            showSuggestions && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          className={cn(
            'w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors',
            'bg-background text-foreground border-input placeholder:text-muted-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring',
            disabled && 'opacity-60 cursor-not-allowed bg-muted',
            isFocused && 'ring-2 ring-ring border-ring',
            error && 'border-destructive focus-visible:ring-destructive',
            value ? 'pr-16' : 'pr-9',
            className
          )}
        />

        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1 text-muted-foreground">
          {value && !disabled && (
            <button
              type="button"
              onClick={clearInput}
              aria-label="Clear vehicle input"
              tabIndex={-1}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="p-1">
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
            ) : (
              <Search className="w-4 h-4 text-muted-foreground/70" />
            )}
          </div>
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl max-h-60 overflow-y-auto animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {suggestions.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <div
                key={item.id || index}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'px-3 py-2 cursor-pointer border-b border-border/40 last:border-b-0 transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'hover:bg-muted/70 text-foreground'
                )}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className={cn('font-medium text-foreground', isActive && 'text-primary')}>
                      {item.vehicle_number}
                    </div>
                    {item.brand && item.model_name && (
                      <div className="text-xs sm:text-sm text-muted-foreground">
                        {`${item.brand} ${item.model_name} (${item.vehicle_modal})`}
                      </div>
                    )}
                    {item.color && (
                      <div className="text-xs text-muted-foreground/80 mt-0.5">
                        Color: {item.color} | Type: {item.type}
                      </div>
                    )}
                  </div>
                  <Check className="w-4 h-4 text-primary shrink-0 ml-2" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No results / Add New prompt */}
      {showSuggestions && suggestions.length === 0 && !loading && value && (
        <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl overflow-hidden animate-in fade-in-50 duration-100">
          {onAddNew ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddNew(value);
                setShowSuggestions(false);
                setActiveIndex(-1);
              }}
              className="w-full px-3 py-3 text-primary font-medium flex items-center justify-center gap-1.5 hover:bg-muted/70 transition-colors text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{addNewText}</span>
            </button>
          ) : (
            <div className="px-3 py-3 text-xs sm:text-sm text-muted-foreground text-center">
              No vehicles found
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-destructive text-xs mt-1">{error}</p>
      )}
    </div>
  );
};
