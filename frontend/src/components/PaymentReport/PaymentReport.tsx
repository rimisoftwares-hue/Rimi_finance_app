import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import PaymentFilter, { FilterType } from './PaymentFilter';
import PaymentTable, { Payment } from './PaymentTable';
import PaymentSummary from './PaymentSummary';
import { FileText, Download } from 'lucide-react';

interface PaymentApiResponse {
  success: boolean;
  payments: Payment[];
  summary: {
    totalPayment: number;
    totalPenalty: number;
    grandTotal: number;
  };
  collectors: string[];
  error?: string;
}

const PaymentReport: React.FC = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPayment, setTotalPayment] = useState(0);
  const [totalPenalty, setTotalPenalty] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [collectors, setCollectors] = useState<string[]>([]);

  const fetchPaymentReport = async (type: FilterType, startDate?: string, endDate?: string, collectedBy?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      let url = `/payments/report?type=${type}`;
      
      if (type === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`;
      }
      if (collectedBy && collectedBy !== 'all') {
        url += `&collectedBy=${collectedBy}`;
      }
      
      const response = await apiClient.get<PaymentApiResponse>(url);

      if (response.data.success) {
        setPayments(response.data.payments || []);
        setTotalPayment(response.data.summary?.totalPayment || 0);
        setTotalPenalty(response.data.summary?.totalPenalty || 0);
        setGrandTotal(response.data.summary?.grandTotal || 0);
        if (response.data.collectors) {
          setCollectors(response.data.collectors);
        }
      } else {
        throw new Error(response.data.error || 'Failed to fetch payment report');
      }
    } catch (err: any) {
      console.error('Error fetching payment report:', err);
      
      const errorMessage = err.response?.data?.error || err.message || 'Failed to load payment report';
      
      setError(errorMessage);
      setPayments([]);
      setTotalPayment(0);
      setTotalPenalty(0);
      setGrandTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentReport('month');
  }, []);

  const handleFilterChange = (type: FilterType, startDate?: string, endDate?: string, collectedBy?: string) => {
    fetchPaymentReport(type, startDate, endDate, collectedBy);
  };

  const getReportTitle = () => {
    return 'Payment Report';
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{getReportTitle()}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            View and analyze payment transactions
          </p>
        </div>
        
        <button 
          className="btn-primary inline-flex items-center gap-2"
          onClick={() => alert('Export functionality coming in future update')}
        >
          <FileText className="h-4 w-4" />
          Export Report
        </button>
      </div>
      
      <PaymentFilter 
        onFilterChange={handleFilterChange} 
        collectors={collectors}
      />
      
      <PaymentSummary 
        totalPayment={totalPayment} 
        totalPenalty={totalPenalty} 
        grandTotal={grandTotal} 
      />
      
      {error && (
        <div className="mb-6 bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-center gap-2 text-destructive">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-sm font-medium">{error}</span>
          </div>
        </div>
      )}
      
      <PaymentTable payments={payments} isLoading={isLoading} />
    </div>
  );
};

export default PaymentReport;