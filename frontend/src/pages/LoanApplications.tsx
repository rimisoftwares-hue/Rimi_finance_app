import { Plus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { TablePagination } from '../components/common';
import { useClientPagination } from '../hooks/useClientPagination';

interface LoanApplicationRow {
  id: string;
  customer: string;
  amount: string;
  status: 'pending' | 'approved' | 'rejected';
  statusLabel: string;
  date: string;
}

const INITIAL_APPLICATIONS: LoanApplicationRow[] = [
  {
    id: 'LOAN001',
    customer: 'John Doe',
    amount: '₹1,50,000',
    status: 'pending',
    statusLabel: 'Pending',
    date: '2024-02-20',
  },
];

const LoanApplications = () => {
  const statusColors = {
    pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
    approved: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
    rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border border-red-500/30',
  };

  const {
    paginatedItems,
    page,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    totalItems,
    startIndex,
    endIndex,
  } = useClientPagination(INITIAL_APPLICATIONS, { initialPageSize: 15 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Loan Applications
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Review, approve, and track incoming loan applications
          </p>
        </div>
        <button className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground font-medium text-sm rounded-md hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4 mr-2" />
          New Application
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="dashboard-card">
          <div className="flex items-center">
            <Clock className="h-5 w-5 text-amber-500 mr-2" />
            <h3 className="text-lg font-semibold text-foreground">Pending</h3>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">23</p>
        </div>
        <div className="dashboard-card">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-emerald-500 mr-2" />
            <h3 className="text-lg font-semibold text-foreground">Approved</h3>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">45</p>
        </div>
        <div className="dashboard-card">
          <div className="flex items-center">
            <XCircle className="h-5 w-5 text-red-500 mr-2" />
            <h3 className="text-lg font-semibold text-foreground">Rejected</h3>
          </div>
          <p className="mt-2 text-3xl font-bold text-foreground">12</p>
        </div>
      </div>

      {/* Applications List */}
      <div className="dashboard-card p-0 overflow-hidden border border-border shadow-sm hover:translate-y-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50">
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Application ID
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Loan Amount
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {paginatedItems.map((app) => (
                <tr key={app.id} className="hover:bg-secondary/40 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-primary">
                    {app.id}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        {app.customer.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {app.customer}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-foreground">
                    {app.amount}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className={`px-2 py-0.5 inline-flex text-xs font-semibold rounded-full ${statusColors[app.status]}`}>
                      {app.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                    {app.date}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                    <a href="#" className="text-primary hover:underline">
                      Review
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
};

export default LoanApplications;