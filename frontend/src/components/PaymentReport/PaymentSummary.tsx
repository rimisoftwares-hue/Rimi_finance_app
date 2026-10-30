import React from 'react';

interface PaymentSummaryProps {
  totalPayment: number;
  totalPenalty: number;
  grandTotal: number;
}

const PaymentSummary: React.FC<PaymentSummaryProps> = ({ 
  totalPayment, 
  totalPenalty, 
  grandTotal 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div className="stat-card border-l-4 border-primary">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground">Total Payment Amount</span>
          <span className="text-2xl font-bold text-primary mt-1">
            ₹{totalPayment.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      
      <div className="stat-card border-l-4 border-warning">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground">Total Penalty Amount</span>
          <span className="text-2xl font-bold text-warning mt-1">
            ₹{totalPenalty.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
      
      <div className="stat-card border-l-4 border-success">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-muted-foreground">Grand Total</span>
          <span className="text-2xl font-bold text-success mt-1">
            ₹{grandTotal.toLocaleString('en-IN')}
          </span>
        </div>
      </div>
    </div>
  );
};

export default PaymentSummary;