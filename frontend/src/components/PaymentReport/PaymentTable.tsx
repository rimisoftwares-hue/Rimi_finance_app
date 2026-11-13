import React, { useState, useMemo } from 'react';
import { Search, ArrowUpDown } from 'lucide-react';
import { useClientPagination } from '../../hooks/useClientPagination';
import { TablePagination, TableSkeletonRows } from '../common';

export interface Payment {
  id: number;
  customerName: string;
  date: string;
  payment: number;
  penalty: number;
  total: number;
  paymentMethod?: string;
  paymentStatus?: string;
  billNumber?: string;
  customerHplno?: string;
  vehicleNumber?: string;
  paymentMode: string;
  collected_by: string;
}

interface PaymentTableProps {
  payments: Payment[];
  isLoading: boolean;
}

type SortField = 'customerName' | 'date' | 'payment' | 'penalty' | 'total';
type SortDirection = 'asc' | 'desc';

const PaymentTable: React.FC<PaymentTableProps> = ({ payments, isLoading }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedPayments = [...payments].sort((a, b) => {
    if (sortField === 'date') {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    }
    
    if (sortField === 'customerName') {
      return sortDirection === 'asc'
        ? a.customerName.localeCompare(b.customerName)
        : b.customerName.localeCompare(a.customerName);
    }
    
    const valueA = a[sortField];
    const valueB = b[sortField];
    return sortDirection === 'asc' ? valueA - valueB : valueB - valueA;
  });

  const filteredPayments = useMemo(
    () =>
      sortedPayments.filter(
        (payment) =>
          payment.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (payment.billNumber &&
            payment.billNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (payment.customerHplno &&
            payment.customerHplno.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (payment.vehicleNumber &&
            payment.vehicleNumber.toLowerCase().includes(searchTerm.toLowerCase()))
      ),
    [sortedPayments, searchTerm]
  );

  const {
    paginatedItems: pagedPayments,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(filteredPayments, { initialPageSize: 15 });

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const columns = [
    { id: 'customerName', label: 'Customer', sortable: true },
    { id: 'date', label: 'Date', sortable: true },
    { id: 'collected_by', label: 'Collected By', sortable: false },
    { id: 'payment', label: 'Payment', sortable: true },
    { id: 'penalty', label: 'Penalty', sortable: true },
    { id: 'total', label: 'Total', sortable: true },
    { id: 'details', label: 'Details', sortable: false },
  ] as const;

  return (
    <div className="dashboard-card p-0 overflow-hidden">
      <div className="p-4 border-b border-border">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <input
            type="text"
            placeholder="Search by customer name, HPL no, vehicle no..."
            className="input-field pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-secondary/50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={`px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:text-foreground' : ''
                  }`}
                  onClick={() => column.sortable && handleSort(column.id as SortField)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && sortField === column.id && (
                      <ArrowUpDown className="h-3 w-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <TableSkeletonRows columns={7} rows={6} />
            ) : pagedPayments.length > 0 ? (
              pagedPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-secondary/30 transition-colors">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-foreground">{payment.customerName}</div>
                    {payment.customerHplno && (
                      <div className="text-xs text-muted-foreground mt-1">HPL: {payment.customerHplno}</div>
                    )}
                    {payment.vehicleNumber && (
                      <div className="text-xs text-muted-foreground">Vehicle: {payment.vehicleNumber}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground">{formatDate(payment.date)}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground">{payment.collected_by || '-'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground">₹{payment.payment.toLocaleString('en-IN')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-foreground">₹{payment.penalty.toLocaleString('en-IN')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-semibold text-foreground">
                      ₹{payment.total.toLocaleString('en-IN')}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm space-y-1">
                      {payment.billNumber && (
                        <div className="text-muted-foreground">
                          <span className="font-medium">Bill:</span> {payment.billNumber}
                        </div>
                      )}
                      {payment.paymentMode && (
                        <div className="text-muted-foreground">
                          <span className="font-medium">Mode:</span> {payment.paymentMode}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center">
                  <div className="text-muted-foreground">
                    No payments found for the selected criteria
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!isLoading && totalItems > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[15, 25, 50]}
          disabled={isLoading}
        />
      )}
    </div>
  );
};

export default PaymentTable;