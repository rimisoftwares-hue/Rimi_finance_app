import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';

export interface TablePaginationProps {
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  totalItems?: number;
  startIndex?: number;
  endIndex?: number;
  disabled?: boolean;
  className?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [15, 25, 50],
  totalItems,
  startIndex,
  endIndex,
  disabled = false,
  className = '',
}) => {
  const safeTotalPages = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotalPages);

  const resolvedOptions = pageSizeOptions.includes(pageSize)
    ? pageSizeOptions
    : [...pageSizeOptions, pageSize].sort((a, b) => a - b);

  return (
    <div
      className={`px-4 py-3 border-t border-border bg-secondary/20 flex flex-wrap items-center justify-between gap-3 text-xs ${className}`}
    >
      {/* Left: Page count + Page Size Dropdown */}
      <div className="flex items-center gap-2 text-muted-foreground flex-wrap">
        <span>
          Page <strong className="text-foreground">{safePage}</strong> of{' '}
          <strong className="text-foreground">{safeTotalPages}</strong>
        </span>
        {totalItems !== undefined && (
          <>
            <span className="text-muted-foreground/60">•</span>
            <span className="text-muted-foreground hidden sm:inline">
              {startIndex !== undefined && endIndex !== undefined ? (
                <>
                  Showing <strong className="text-foreground">{startIndex}</strong>–
                  <strong className="text-foreground">{endIndex}</strong> of{' '}
                  <strong className="text-foreground">{totalItems}</strong>
                </>
              ) : (
                <>
                  <strong className="text-foreground">{totalItems}</strong> items
                </>
              )}
            </span>
          </>
        )}
        <span className="text-muted-foreground/60">•</span>
        <div className="w-[105px]">
          <Select
            value={String(pageSize)}
            onValueChange={(val) => onPageSizeChange(Number(val))}
            disabled={disabled}
          >
            <SelectTrigger className="h-7 px-2 text-xs bg-background border-border text-foreground hover:bg-secondary/40 transition-colors">
              <SelectValue placeholder={`${pageSize} / page`} />
            </SelectTrigger>
            <SelectContent className="bg-popover border-border z-50">
              {resolvedOptions.map((opt) => (
                <SelectItem key={opt} value={String(opt)} className="text-xs">
                  {opt} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right: Prev & Next buttons */}
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={safePage <= 1 || disabled}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
          className="h-7 px-2.5 text-xs gap-1 hover:bg-secondary/50"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={safePage >= safeTotalPages || disabled}
          onClick={() => onPageChange(Math.min(safeTotalPages, safePage + 1))}
          className="h-7 px-2.5 text-xs gap-1 hover:bg-secondary/50"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};

