import React, { useState, useEffect } from 'react';
import { DatePicker } from '../ui/date-picker';

export type FilterType = 'today' | 'custom' | 'week' | 'month' | 'year';

interface PaymentFilterProps {
  onFilterChange: (type: FilterType, startDate?: string, endDate?: string, collectedBy?: string) => void;
  collectors?: string[];
}

const PaymentFilter: React.FC<PaymentFilterProps> = ({ onFilterChange, collectors = [] }) => {
  const [filterType, setFilterType] = useState<FilterType>('month');
  const [startDate, setStartDate] = useState<string>(
    new Date(new Date().setDate(new Date().getDate() - 30))
      .toISOString()
      .split('T')[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [collectedBy, setCollectedBy] = useState<string>('all');

  const handleFilterTypeChange = (type: FilterType) => {
    setFilterType(type);
    
    if (type !== 'custom') {
      onFilterChange(type, undefined, undefined, collectedBy);
    } else {
      onFilterChange(type, startDate, endDate, collectedBy);
    }
  };

  const handleDateChange = () => {
    if (filterType === 'custom') {
      onFilterChange('custom', startDate, endDate, collectedBy);
    }
  };

  const handleCollectorChange = (collector: string) => {
    setCollectedBy(collector);
    onFilterChange(filterType, startDate, endDate, collector);
  };

  const filterButtons = [
    { id: 'today', label: 'Today' },
    { id: 'custom', label: 'Custom Range' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'year', label: 'This Year' },
  ] as const;

  return (
    <div className="form-section mb-6">
      <h2 className="form-section-title">Payment Report Filters</h2>
      
      <div className="flex flex-wrap gap-3 mb-4">
        {filterButtons.map((button) => (
          <button
            key={button.id}
            onClick={() => handleFilterTypeChange(button.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              filterType === button.id
                ? 'btn-primary'
                : 'btn-secondary'
            }`}
          >
            {button.label}
          </button>
        ))}
      </div>

      {/* Collector Filter Dropdown */}
      {collectors.length > 0 && (
        <div className="mb-4">
          <label htmlFor="collectorFilter" className="input-label">
            Filter by Collector
          </label>
          <select
            id="collectorFilter"
            value={collectedBy}
            onChange={(e) => handleCollectorChange(e.target.value)}
            className="input-field w-full md:w-auto"
          >
            <option value="all">All Collectors</option>
            {collectors.map((collector) => (
              <option key={collector} value={collector}>
                {collector}
              </option>
            ))}
          </select>
        </div>
      )}
      
      {filterType === 'custom' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <label htmlFor="startDate" className="input-label">
              Start Date
            </label>
            <DatePicker
              id="startDate"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setTimeout(handleDateChange, 100);
              }}
              placeholder="Start Date"
            />
          </div>
          
          <div>
            <label htmlFor="endDate" className="input-label">
              End Date
            </label>
            <DatePicker
              id="endDate"
              value={endDate}
              min={startDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setTimeout(handleDateChange, 100);
              }}
              placeholder="End Date"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentFilter;