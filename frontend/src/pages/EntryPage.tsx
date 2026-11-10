import React from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { MultiStepLoanEntryForm } from '../components/form/MultiStepLoanEntryForm';
import { LoanType } from '../components/form/LoanTypeToggle';

interface EntryPageProps {
  initialType?: LoanType;
}

const EntryPage: React.FC<EntryPageProps> = ({ initialType }) => {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const queryType = searchParams.get('type')?.toLowerCase();
  const resolvedType: LoanType =
    initialType || (queryType === 'vehicle' ? 'vehicle' : 'consulting');

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="w-full mx-auto">
        <MultiStepLoanEntryForm
          key={`${location.pathname}?type=${resolvedType}`}
          initialType={resolvedType}
        />
      </div>
    </div>
  );
};

export default EntryPage;

