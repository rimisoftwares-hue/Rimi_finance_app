import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Skeleton } from '../../ui/skeleton';
import { cn } from '../../lib/utils';

export interface TableSkeletonRowsProps {
  columns: number;
  rows?: number;
}

export interface PageTableSkeletonProps {
  statCardsCount?: number;
  columns: number;
  rows?: number;
  showSearch?: boolean;
}

export interface CardGridSkeletonProps {
  count?: number;
}

const FIRST_CELL_WIDTHS = ['w-4/5', 'w-3/4', 'w-5/6', 'w-2/3', 'w-4/5', 'w-3/4'];
const CELL_WIDTH_VARIANTS = ['w-2/3', 'w-1/2', 'w-3/4', 'w-3/5', 'w-4/5', 'w-1/2'];
const HEADER_WIDTH_VARIANTS = ['w-24', 'w-20', 'w-28', 'w-16', 'w-24', 'w-20'];

export const TableSkeletonRows: React.FC<TableSkeletonRowsProps> = ({
  columns,
  rows = 6,
}) => {
  const safeRows = Math.max(1, rows);
  const safeCols = Math.max(1, columns);

  return (
    <>
      {Array.from({ length: safeRows }).map((_, rowIndex) => (
        <tr
          key={rowIndex}
          aria-busy="true"
          className="border-b border-border/50"
        >
          {Array.from({ length: safeCols }).map((__, colIndex) => {
            const widthClass =
              colIndex === 0
                ? FIRST_CELL_WIDTHS[rowIndex % FIRST_CELL_WIDTHS.length]
                : CELL_WIDTH_VARIANTS[(rowIndex + colIndex) % CELL_WIDTH_VARIANTS.length];

            return (
              <td key={colIndex} className="px-4 py-3.5 align-middle">
                {rowIndex === 0 && colIndex === 0 && (
                  <span className="sr-only">Loading</span>
                )}
                <Skeleton
                  className={cn(
                    'h-4 motion-reduce:animate-none',
                    colIndex === 0 ? 'max-w-[180px]' : 'max-w-[140px]',
                    widthClass
                  )}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
};

export const PageTableSkeleton: React.FC<PageTableSkeletonProps> = ({
  statCardsCount = 4,
  columns,
  rows = 6,
  showSearch = true,
}) => {
  const shouldReduceMotion = useReducedMotion();
  const safeCols = Math.max(1, columns);

  return (
    <motion.div
      aria-busy="true"
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="min-h-screen bg-background text-foreground"
    >
      <span className="sr-only">Loading</span>

      {/* Header bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <Skeleton className="h-8 w-48 motion-reduce:animate-none" />
        <Skeleton className="h-9 w-32 rounded-lg motion-reduce:animate-none" />
      </div>

      {/* Stat cards */}
      {statCardsCount > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: statCardsCount }).map((_, idx) => (
            <div key={idx} className="stat-card">
              <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
              <Skeleton className="mt-2 h-7 w-16 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="flex gap-4 mb-6">
          <div className="flex-1">
            <Skeleton className="h-[42px] w-full rounded-lg motion-reduce:animate-none" />
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-secondary/50 border-b border-border">
              <tr>
                {Array.from({ length: safeCols }).map((_, colIdx) => (
                  <th key={colIdx} className="px-6 py-3 text-left">
                    <Skeleton
                      className={cn(
                        'h-3.5 motion-reduce:animate-none',
                        HEADER_WIDTH_VARIANTS[colIdx % HEADER_WIDTH_VARIANTS.length]
                      )}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              <TableSkeletonRows columns={safeCols} rows={rows} />
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};

export const CardGridSkeleton: React.FC<CardGridSkeletonProps> = ({
  count = 6,
}) => {
  const safeCount = Math.max(1, count);

  return (
    <div
      aria-busy="true"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
    >
      <span className="sr-only">Loading</span>
      {Array.from({ length: safeCount }).map((_, idx) => (
        <div
          key={idx}
          className="card-elevated p-5 rounded-2xl border border-border bg-card flex flex-col justify-between space-y-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Skeleton className="w-11 h-11 rounded-full shrink-0 motion-reduce:animate-none" />
              <div className="space-y-2 flex-1 min-w-0">
                <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
                <Skeleton className="h-3 w-1/2 motion-reduce:animate-none" />
              </div>
            </div>
            <Skeleton className="h-5 w-16 rounded-full shrink-0 motion-reduce:animate-none" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border/60">
            <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-3/4 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-2/3 col-span-2 motion-reduce:animate-none" />
          </div>

          <div className="space-y-2 pt-2 border-t border-border/60">
            <Skeleton className="h-3 w-24 motion-reduce:animate-none" />
            <div className="flex flex-wrap gap-1.5">
              <Skeleton className="h-5 w-20 rounded-md motion-reduce:animate-none" />
              <Skeleton className="h-5 w-24 rounded-md motion-reduce:animate-none" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
