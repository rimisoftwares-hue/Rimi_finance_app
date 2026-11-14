import { useState, useMemo, useEffect } from 'react';

export interface UseClientPaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
  resetKey?: unknown;
}

export function useClientPagination<T>(
  items: T[],
  options: UseClientPaginationOptions = {}
) {
  const { initialPage = 1, initialPageSize = 15, resetKey } = options;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to page 1 if total item count changes or explicit resetKey changes
  useEffect(() => {
    setPage(1);
  }, [items.length, resetKey]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp page state if totalPages shrinks
  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  // Ensure current page is bounded
  const safePage = Math.min(Math.max(1, page), totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const startIndex = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endIndex = Math.min(safePage * pageSize, totalItems);

  return {
    page: safePage,
    pageSize,
    setPage,
    setPageSize: (size: number) => {
      setPageSize(size);
      setPage(1);
    },
    totalPages,
    totalItems,
    paginatedItems,
    startIndex,
    endIndex,
    hasPrevPage: safePage > 1,
    hasNextPage: safePage < totalPages,
  };
}

