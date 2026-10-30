// AppWithFinanceLogin.tsx
import React from 'react';
import { FinanceAuthProvider, useFinanceAuth } from './contexts/FinanceAuthContext';
import { AuthProvider } from './contexts/AuthContext';
import FinanceLoginPage from './pages/FinanceLogin';

const AppContent: React.FC = () => {
  const { finance, isLoading } = useFinanceAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!finance) {
    return <FinanceLoginPage />;
  }

  return (
    <AuthProvider>
      <h1>hello</h1>
    </AuthProvider>
  );
};

export const AppWithFinanceLogin: React.FC = () => {
  return (
    <FinanceAuthProvider>
      <AppContent />
    </FinanceAuthProvider>
  );
};