// frontend/src/components/common/AutoSuggestInput.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useId
} from 'react';
import { cn } from '../lib/utils';
import { ChevronDown, Loader2, X, Search } from 'lucide-react';
import apiClient from '../../api/apiClient';

export interface SuggestionItem {
  value: string;
  label: string;
  [key: string]: any;
}

export type SuggestionField =
  | 'street_name'
  | 'village'
  | 'city'
  | 'district'
  | 'state'
  | 'pincode';

export interface AutoSuggestInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (item: SuggestionItem) => void;

  error?: string;
  placeholder?: string;

  className?: string;
  containerClassName?: string;
  inputClassName?: string;

  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;

  // Mode A: Static suggestions
  suggestions?: string[] | SuggestionItem[];

  // Mode B: Dynamic API suggestions
  field?: SuggestionField;
  filters?: {
    state?: string;
    district?: string;
    city?: string;
  };

  minSearchLength?: number;
  debounceMs?: number;
  maxSuggestions?: number;

  emptyMessage?: string;
  loadingMessage?: string;
  showClearButton?: boolean;

  onBlur?: () => void;
  onFocus?: () => void;
  id?: string;
}

export const AutoSuggestInput: React.FC<AutoSuggestInputProps> = ({
  label,
  value,
  onChange,
  onSelect,
  error,
  placeholder,
  className,
  containerClassName,
  inputClassName,
  required = false,
  disabled = false,
  autoFocus = false,
  suggestions,
  field,
  filters,
  minSearchLength = 2,
  debounceMs = 250,
  maxSuggestions = 10,
  emptyMessage = 'No suggestions found',
  loadingMessage = 'Searching...',
  showClearButton = true,
  onBlur,
  onFocus,
  id: customId,
}) => {
  const generatedId = useId();
  const inputId = customId || `autosuggest-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [inputValue, setInputValue] = useState(value || '');
  const [userQuery, setUserQuery] = useState(value || '');
  const [apiSuggestions, setApiSuggestions] = useState<SuggestionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const reqIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isNavigatingWithArrowsRef = useRef<boolean>(false);
  const lastPropValueRef = useRef<string>(value || '');

  // Synchronize internal input value with parent controlled value
  useEffect(() => {
    if (value !== lastPropValueRef.current) {
      lastPropValueRef.current = value || '';
      isNavigatingWithArrowsRef.current = false;
      setInputValue(value || '');
      setUserQuery(value || '');
      setActiveIndex(-1);
    }
  }, [value]);

  // Mode A: Normalize static suggestions into SuggestionItem[]
  const normalizedStatic = useMemo<SuggestionItem[]>(() => {
    if (!suggestions || suggestions.length === 0) return [];
    return suggestions.map((item) =>
      typeof item === 'string'
        ? { value: item, label: item }
        : item
    );
  }, [suggestions]);

  // Compute displayed suggestions filtered against userQuery (stable during arrow navigation)
  const displaySuggestions = useMemo<SuggestionItem[]>(() => {
    if (field) {
      return apiSuggestions.slice(0, maxSuggestions);
    }

    if (!normalizedStatic.length) return [];
    const query = userQuery.trim().toLowerCase();
    if (!query) {
      return normalizedStatic.slice(0, maxSuggestions);
    }

    return normalizedStatic
      .filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          item.value.toLowerCase().includes(query)
      )
      .slice(0, maxSuggestions);
  }, [field, apiSuggestions, normalizedStatic, userQuery, maxSuggestions]);

  // Mode B: Dynamic backend fetcher with race-condition guards using userQuery
  const fetchDynamicSuggestions = useCallback(
    async (query: string) => {
      if (!field) return;

      const trimmed = query.trim();
      if (trimmed.length < minSearchLength) {
        setApiSuggestions([]);
        setIsLoading(false);
        return;
      }

      const currentReqId = ++reqIdRef.current;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      try {
        const filterParams = new URLSearchParams({
          q: trimmed,
          filters: JSON.stringify(filters || {})
        }).toString();

        const response = await apiClient.get<{
          success: boolean;
          suggestions?: Array<{ value: string; label?: string }>;
        }>(`/address/suggestions/${field}?${filterParams}`, {
          signal: controller.signal
        });

        if (currentReqId !== reqIdRef.current) return;

        if (response.data && response.data.success) {
          const list: SuggestionItem[] = (response.data.suggestions || []).map((s) => ({
            value: s.value,
            label: s.label || s.value
          }));
          setApiSuggestions(list);
        } else {
          setApiSuggestions([]);
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        if (currentReqId !== reqIdRef.current) return;
        setApiSuggestions([]);
      } finally {
        if (currentReqId === reqIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [field, filters, minSearchLength]
  );

  // Debounce dynamic API fetch triggered ONLY by userQuery changes
  useEffect(() => {
    if (!field) return;

    const timer = setTimeout(() => {
      fetchDynamicSuggestions(userQuery);
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [field, userQuery, fetchDynamicSuggestions, debounceMs]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Click outside to dismiss dropdown and restore original user query if previewing
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        if (isNavigatingWithArrowsRef.current) {
          setInputValue(userQuery);
          isNavigatingWithArrowsRef.current = false;
        }
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [userQuery]);

  // Auto-scroll highlighted suggestion into view
  useEffect(() => {
    if (isOpen && activeIndex >= 0 && itemRefs.current[activeIndex]) {
      itemRefs.current[activeIndex]?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [activeIndex, isOpen]);

  // Selection handler
  const handleSelectItem = (item: SuggestionItem) => {
    isNavigatingWithArrowsRef.current = false;
    setInputValue(item.value);
    setUserQuery(item.value);
    lastPropValueRef.current = item.value;
    onChange(item.value);
    if (onSelect) {
      onSelect(item);
    }
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    isNavigatingWithArrowsRef.current = false;
    setUserQuery(newVal);
    setInputValue(newVal);
    lastPropValueRef.current = newVal;
    onChange(newVal);
    setIsOpen(true);
    setActiveIndex(-1);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    if (onFocus) onFocus();

    // In static mode or if length qualifies in dynamic mode, open dropdown
    if (field) {
      if (userQuery.trim().length >= minSearchLength) {
        setIsOpen(true);
      }
    } else if (normalizedStatic.length > 0) {
      setIsOpen(true);
    }
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    if (onBlur) onBlur();

    if (isNavigatingWithArrowsRef.current) {
      setInputValue(userQuery);
      isNavigatingWithArrowsRef.current = false;
      setActiveIndex(-1);
    } else if (inputValue !== value) {
      onChange(inputValue);
    }
  };

  const clearInput = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isNavigatingWithArrowsRef.current = false;
    setInputValue('');
    setUserQuery('');
    lastPropValueRef.current = '';
    onChange('');
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  // Chrome-style keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        if (displaySuggestions.length > 0) {
          setActiveIndex(0);
          isNavigatingWithArrowsRef.current = true;
          setInputValue(displaySuggestions[0].value);
        }
      } else if (displaySuggestions.length > 0) {
        const nextIndex =
          activeIndex < displaySuggestions.length - 1 ? activeIndex + 1 : -1;
        setActiveIndex(nextIndex);
        if (nextIndex === -1) {
          isNavigatingWithArrowsRef.current = false;
          setInputValue(userQuery);
        } else {
          isNavigatingWithArrowsRef.current = true;
          setInputValue(displaySuggestions[nextIndex].value);
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        if (displaySuggestions.length > 0) {
          const lastIdx = displaySuggestions.length - 1;
          setActiveIndex(lastIdx);
          isNavigatingWithArrowsRef.current = true;
          setInputValue(displaySuggestions[lastIdx].value);
        }
      } else if (displaySuggestions.length > 0) {
        let prevIndex = -1;
        if (activeIndex > 0) {
          prevIndex = activeIndex - 1;
        } else if (activeIndex === 0) {
          prevIndex = -1;
        } else {
          // activeIndex === -1, move to last suggestion
          prevIndex = displaySuggestions.length - 1;
        }

        setActiveIndex(prevIndex);
        if (prevIndex === -1) {
          isNavigatingWithArrowsRef.current = false;
          setInputValue(userQuery);
        } else {
          isNavigatingWithArrowsRef.current = true;
          setInputValue(displaySuggestions[prevIndex].value);
        }
      }
    } else if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < displaySuggestions.length) {
        e.preventDefault();
        e.stopPropagation();
        handleSelectItem(displaySuggestions[activeIndex]);
      } else {
        if (isOpen) {
          setIsOpen(false);
          setActiveIndex(-1);
          isNavigatingWithArrowsRef.current = false;
        }
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        e.stopPropagation();
        setInputValue(userQuery);
        setActiveIndex(-1);
        setIsOpen(false);
        isNavigatingWithArrowsRef.current = false;
      }
    } else if (e.key === 'Tab') {
      if (isOpen) {
        setInputValue(userQuery);
        setActiveIndex(-1);
        setIsOpen(false);
        isNavigatingWithArrowsRef.current = false;
      }
    }
  };

  return (
    <div
      className={cn(
        'w-full relative',
        isOpen ? 'z-30' : 'z-auto',
        containerClassName
      )}
      ref={containerRef}
    >
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-muted-foreground mb-1"
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={
            isOpen && activeIndex >= 0
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
            'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:cursor-not-allowed disabled:opacity-50',
            (showClearButton && inputValue) || isLoading ? 'pr-16' : 'pr-8',
            error && 'border-destructive focus-visible:ring-destructive',
            inputClassName,
            className
          )}
        />

        {/* Right side controls */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-muted-foreground">
          {showClearButton && inputValue && !disabled && (
            <button
              type="button"
              onClick={clearInput}
              aria-label="Clear input"
              tabIndex={-1}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Toggle suggestions"
              onClick={() => {
                if (!disabled) {
                  setIsOpen((prev) => !prev);
                  inputRef.current?.focus();
                }
              }}
              className="p-0.5 rounded-full hover:bg-muted text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            >
              <ChevronDown
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-200',
                  isOpen && 'rotate-180 text-foreground'
                )}
              />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}

      {/* Suggestions Dropdown Panel */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover text-popover-foreground border border-border rounded-xl shadow-xl max-h-60 overflow-y-auto py-1 animate-in fade-in-50 zoom-in-95 duration-100"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>{loadingMessage}</span>
            </div>
          ) : displaySuggestions.length > 0 ? (
            <ul className="divide-y divide-border/40">
              {displaySuggestions.map((item, index) => {
                const isActive = index === activeIndex;
                const isSelected = item.value === value;
                return (
                  <li
                    key={`${item.value}-${index}`}
                    ref={(el) => {
                      itemRefs.current[index] = el;
                    }}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={isActive || isSelected}
                    onMouseDown={(e) => {
                      // Prevent blur before click executes
                      e.preventDefault();
                      handleSelectItem(item);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={cn(
                      'px-3 py-2 text-xs sm:text-sm cursor-pointer transition-colors flex items-center justify-between',
                      isActive
                        ? 'bg-primary/10 text-primary font-medium'
                        : isSelected
                        ? 'bg-secondary font-medium text-foreground'
                        : 'text-foreground hover:bg-muted/70'
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                    {isSelected && (
                      <span className="text-[10px] uppercase font-semibold text-primary/80 ml-2">
                        Selected
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-3 py-3 text-xs text-center text-muted-foreground">
              {emptyMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
