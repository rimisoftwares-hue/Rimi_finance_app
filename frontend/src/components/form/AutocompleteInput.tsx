// components/AutocompleteInput.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, X, Plus } from 'lucide-react';

interface AutocompleteInputProps {
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
  addNewText = 'Add Vehicle'
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
    onChange(newValue);
    setShowSuggestions(newValue.length > 0);
  };

  const handleSelect = (item: any) => {
    onChange(item.vehicle_number);
    if (onSelect) {
      onSelect(item);
    }
    setShowSuggestions(false);
  };

  const clearInput = () => {
    onChange('');
    setShowSuggestions(false);
    if (onSelect) {
      onSelect(null);
    }
  };

  return (
    <div className={`relative ${containerClassName}`} ref={containerRef}>
      <label className="block text-sm font-medium mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      
      <div className="relative">
        <input
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
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition ${
            error ? 'border-red-500' : 'border-gray-300'
          } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'} ${
            isFocused ? 'ring-2 ring-blue-500 border-blue-500' : ''
          } ${className}`}
          autoComplete="off"
        />
        
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
          {value && (
            <button
              type="button"
              onClick={clearInput}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="text-gray-400">
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
            ) : (
              <Search className="w-4 h-4" />
            )}
          </div>
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((item, index) => (
            <div
              key={item.id || index}
              onClick={() => handleSelect(item)}
              className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{item.vehicle_number}</div>
                  {item.brand && item.model_name && (
                    <div className="text-sm text-gray-500">
                      {`${item.brand} ${item.model_name} (${item.vehicle_modal})`}
                    </div>
                  )}
                  {item.color && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      Color: {item.color} | Type: {item.type}
                    </div>
                  )}
                </div>
                <Check className="w-4 h-4 text-green-500" />
              </div>
            </div>
          ))}
        </div>
      )}

      {showSuggestions && suggestions.length === 0 && !loading && value && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
          {onAddNew ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddNew(value);
                setShowSuggestions(false);
              }}
              className="w-full px-3 py-3 text-blue-600 font-normal flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors text-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{addNewText}</span>
            </button>
          ) : (
            <div className="px-3 py-3 text-gray-500 text-center">
              No vehicles found
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-500 text-xs mt-1">{error}</p>
      )}
    </div>
  );
};