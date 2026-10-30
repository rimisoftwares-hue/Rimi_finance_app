import React, { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '../lib/utils';
import { ChevronDown, Search, Loader2 } from 'lucide-react';
import apiClient from '../../api/apiClient';

interface Suggestion {
  value: string;
  label: string;
}

interface AutoSuggestInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  field: 'street_name' | 'village' | 'city' | 'district' | 'state' | 'pincode';
  filters?: {
    state?: string;
    district?: string;
    city?: string;
  };
  required?: boolean;
  disabled?: boolean;
}

export const AutoSuggestInput: React.FC<AutoSuggestInputProps> = ({
  label,
  value,
  onChange,
  error,
  placeholder,
  field,
  filters = {},
  required = false,
  disabled = false
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch suggestions from backend
  const fetchSuggestions = useCallback(async (searchValue: string) => {
    if (searchValue.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      const filterParams = new URLSearchParams({
        q: searchValue,
        filters: JSON.stringify(filters)
      }).toString();

      const response = await apiClient.get(
        `/address/suggestions/${field}?${filterParams}`
      );
      
      const data = response.data;
      if (data.success) {
        setSuggestions(data.suggestions || []);
      } else {
        throw new Error(data.error || 'Failed to fetch suggestions');
      }
    } catch (error) {
      console.error(`Error fetching ${field} suggestions:`, error);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }

  }, [field, filters]);

  // Handle input change with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, fetchSuggestions]);

  // Handle external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowSuggestions(true);
  };

  const handleInputFocus = () => {
    setIsFocused(true);
    if (inputValue.length >= 2) {
      setShowSuggestions(true);
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setInputValue(suggestion.value);
    onChange(suggestion.value);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleInputBlur = () => {
    setIsFocused(false);
    // Update parent with current value on blur
    if (inputValue !== value) {
      onChange(inputValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onChange(inputValue);
      setShowSuggestions(false);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className="w-full relative" ref={containerRef}>
      <label className="input-label">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
        //   disabled={disabled}
          className={cn(
            "input-field w-full pr-10",
            error && "border-destructive focus:ring-destructive",
            isFocused && "ring-2 ring-primary ring-opacity-20",
            // disabled && "opacity-60 cursor-not-allowed"
          )}
        />
        
        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-1">
          {/* {isLoading ? (
            <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-muted-foreground" />
          )} */}
          <ChevronDown className={cn(
            "w-4 h-4 text-muted-foreground transition-transform",
            showSuggestions && "rotate-180"
          )} />
        </div>
      </div>

      {error && (
        <p className="error-message mt-1">{error}</p>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          <ul className="py-1">
            {suggestions.map((suggestion, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full text-left px-4 py-2 hover:bg-accent focus:bg-accent focus:outline-none transition-colors"
                >
                  <span className="text-sm text-foreground">{suggestion.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};