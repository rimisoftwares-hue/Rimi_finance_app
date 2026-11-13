import { useState, useMemo, useEffect } from 'react';

export interface UseClientPaginationOptions {
  initialPage?: number;
  initialPageSize?: number;
}

export function useClientPagination<T>(
  items: T[],
  options: UseClientPaginationOptions = {}
) {
  const { initialPage = 1, initialPageSize = 15 } = options;
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Reset to page 1 if total item count changes significantly or filters re-apply
  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

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

