import { Component, ReactNode, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from "./components/Layout";
import { Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
// import { FinanceAuthProvider, useFinanceAuth } from './contexts/FinanceAuthContext';
import { OwnerAuthProvider, useOwnerAuth } from './contexts/OwnerAuthContext'
import { useAuth } from './contexts/AuthContext';
import FinanceLogin from './pages/FinanceLogin';
import OwnerLogin from './pages/OwnerLogin';
import UserLogin from './pages/UserLogin';
import Dashboard from './pages/Dashboard';
import Customers from './pages/Customers';
import AddCustomerConsultingFrom from './pages/AddCustomerConsultingFrom';
import AddCustomerVehicleLoanForm from './pages/AddCustomerVehicleLoanForm'
// import AgentCustomerDetails from './pages/AgentCustomerDetails';
import AddCustomerForm from './pages/AddCustomerForm';
import UpdateCustomerForm from './pages/UpdateCustomerForm';
import UnpaidLoans from './pages/UnpaidLoans';
import LoanApplications from './pages/LoanApplications';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Unauthorized from './pages/Unauthorized';
import Vehicles from "./pages/Vehicles";
import ProtectedRoute from './components/ProtectedRoute';
import { AddVehiclePage } from './components/vehicles old/AddVehicleForm';
import { EditVehiclePage } from './components/vehicles old/EditVehiclePage';
import { VehicleDetails } from './components/vehicles old/VehicleDetails';
import ConsultingEdit from './components/form/ConsultingEdit';
import VehicleLoanEdit from './components/form/VehicleLoanEdit';
import { AuthProvider } from './contexts/AuthContext';
import { initializeNavigation, recordNavigation } from './utils/navigationHistory';
import PaymentReport from './components/PaymentReport/PaymentReport';
import CrudModal from './components/CrudModal';
import CustomerDetails from './pages/CustomerDetails'
import EditCustomer from './pages/EditCustomer'
import { Toaster } from './components/ui/toaster';
import NotFoundPage from './pages/NotFoundPage';
import { DrillDownProvider } from './components/lib/accounting/DrillDown';

import { useNavigate } from 'react-router-dom'; import OfficeExpencePage from './pages/OfficeExpence';
import NotificationPage from './pages/NotificationPage';
import RouteDebug from './components/RouteDebug';

// Collections
import PendingCollections from './components/collections/PendingCollections';
import KYCPending from './components/collections/KYCPending';
import Terminated from './components/collections/Terminated';
import GodownVehicle from './components/collections/GodownVehicle';

// Reports
import CollectionReport from './components/reports/CollectionReport';
import ActivityLog from './components/reports/ActivityLog';
import Revenue from './components/reports/Revenue';
import DueAnalysis from './components/reports/DueAnalysis';
import Compliance from './components/reports/Compliance';
import Charges from './components/reports/Charges';
import Balances from './components/reports/Balances';
import Bill from './components/reports/Bill';

// Accounts
import DayBook from './components/accounts/DayBook';
import Statements from './components/accounts/Statements';
import Business from './components/accounts/Business';
import Demand from './components/accounts/Demand';
import BalanceSheet from './components/accounts/BalanceSheet';
import TrialBalance from './components/accounts/TrialBalance';
import ProfitLoss from './components/accounts/ProfitLoss';
import Ledger from './components/accounts/Ledger';
import CashFlow from './components/accounts/CashFlow';
import LedgerGroups from './components/accounts/LedgerGroups';
import Vouchers from './components/accounts/Vouchers';

// AI Assistant
import AIDashboard from './components/ai/AIDashboard';
import LeadCalling from './components/ai/LeadCalling';
import AILogs from './components/ai/AILogs';
import AIInsights from './components/ai/AIInsights';
import AISettings from './components/ai/AISettings';

// Customer Locator
import CustomerTrack from './components/locator/Track';
import CustomerAlerts from './components/locator/Alerts';
import CustomerInsights from './components/locator/Insights';
import CustomerLiveMap from './components/locator/LiveMap';

// Other
import Notices from './components/Notice/Notices';
import LoanRequests from './pages/LoanRequests';
import Loans from './pages/Loans';
import StaffLocationReport from './components/agents/StaffLocationReport';

//Masters
import CompanyProfile from './components/master/CompanyProfile';
import Settings from './components/master/Settings';
import RSPBankMaster from './components/master/RSPBankMaster';
import HandLoan from './components/master/HandLoan';
import BadDebts from './components/master/BadDebts';

//users
import AgentManagement from './components/agents/AgentManagement';
import AssignCustomers from "./components/agents/AssignCustomers";
import AreaAllocation from "./components/agents/AreaAllocation";
import AssignmentHistory from "./components/agents/AssignmentHistory";
import StaffLoginReport from './components/agents/StaffLoginReport';
import UserProfile from './pages/UserProfile';
import SessionExpiredModal from './components/auth/SessionExpiredModal';


import VehiclesPage from './pages/vehicles.index'

// ErrorBoundary component with TypeScript`
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div className="p-4 text-red-500">Something went wrong. Please refresh the page.</div>;
    }

    return this.props.children;
  }
}
// Create a wrapper component that uses the finance auth hook
function AppContent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { owner, isLoading } = useOwnerAuth();
  const navigate = useNavigate()
  const shortcutMap = {
    F1: '/ConsultingForm',
    F2: '/VehicleLoanForm',
    F3: '/unpaidloans',
    F4: '/customers',
    F5: '/dashboard',
    F6: '/loanApplications',
    F7: '/vehicle',
    // Add more shortcuts as needed
  };

  useEffect(() => {
    const cleanup = initializeNavigation();
    return cleanup;
  }, []);

  // Tauri window close session cleanup
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          const { getCurrentWindow } = await import('@tauri-apps/api/window');
          unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
            if (!sessionStorage.getItem('authToken')) return; // nothing to close; let it exit
            event.preventDefault();
            try {
              await Promise.race([
                apiClient.post('/auth/user-logout', { reason: 'window_close' }),
                new Promise((r) => setTimeout(r, 2000)), // never trap the user in the app
              ]);
            } catch { /* server-side timeout closer will handle it */ }
            await getCurrentWindow().destroy();
          });
        }
      } catch (e) {
        console.warn('Tauri window close listener not attached:', e);
      }
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  // Track every React Router navigation so Alt+Left/Right work correctly
  const location = useLocation();
  useEffect(() => {
    recordNavigation();
  }, [location]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+B for modal (existing)
      if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setIsModalOpen(true);
      }

      // F-key shortcuts for navigation
      if (e.key?.startsWith('F') && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        const route = shortcutMap[e.key as keyof typeof shortcutMap];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [navigate]); // Add navigate to dependency array

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!owner) {
    return <OwnerLogin />;
  }

  return (
    <AuthProvider>
      <DrillDownProvider>
        <div className="min-h-screen bg-gray-50 select-none ">
          {/* Toast Notifications */}
          <Toaster />
          {/* Login Time Restriction Modal */}
          <SessionExpiredModal />
          <ErrorBoundary>
            {/* Main Content */}
            <Routes>
              {/* Public routes that don't require owner */}
              <Route path="/owner-login" element={<OwnerLogin />} />
              <Route path="/user-login" element={<UserLogin />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/unauthorized" element={<Unauthorized />} />


              {/* Protected routes under Layout */}
              <Route path="/" element={<Layout />}>
                {/* Remove or fix the problematic Navigate route */}
                {/* <Route path="/dashboard" element={<Navigate to="/" replace />} /> */}
                {/* Protected routes - both owner and agent */}
                <Route index element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />

                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/notification" element={
                  <ProtectedRoute>
                    <NotificationPage />
                  </ProtectedRoute>
                } />


                <Route path="/paymentReport" element={
                  <ProtectedRoute>
                    <PaymentReport />
                  </ProtectedRoute>
                } />
                <Route path="/customers" element={
                  <ProtectedRoute>
                    <Customers />
                  </ProtectedRoute>
                } />
                <Route path="/ConsultingForm" element={
                  <ProtectedRoute>
                    <AddCustomerConsultingFrom />
                  </ProtectedRoute>
                } />
                <Route path="/VehicleLoanForm" element={
                  <ProtectedRoute>
                    <AddCustomerVehicleLoanForm />
                  </ProtectedRoute>
                } />
                <Route path="/AddVehicleForm" element={
                  <ProtectedRoute>
                    <AddVehiclePage />
                  </ProtectedRoute>
                } />
                <Route path="/vehicles/:id/edit" element={
                  <ProtectedRoute>
                    <EditVehiclePage />
                  </ProtectedRoute>
                } />
                <Route path="/agent/customers/:customerId" element={
                  <ProtectedRoute>
                    <CustomerDetails />
                  </ProtectedRoute>
                } />
                <Route path="/loanApplications" element={
                  <ProtectedRoute>
                    <LoanApplications />
                  </ProtectedRoute>
                } />
                <Route path="/allcustomers" element={
                  <ProtectedRoute>
                    <Customers />
                  </ProtectedRoute>
                } />
                <Route path="/closeloancustomer" element={
                  <ProtectedRoute>
                    <Customers />
                  </ProtectedRoute>
                } />
                <Route path="/unpaidloans" element={
                  <ProtectedRoute>
                    <UnpaidLoans />
                  </ProtectedRoute>
                } />
                <Route path="/todayunpaidloans" element={
                  <ProtectedRoute>
                    <UnpaidLoans />
                  </ProtectedRoute>
                } />
                <Route path="/pendingunpaidloans" element={
                  <ProtectedRoute>
                    <UnpaidLoans />
                  </ProtectedRoute>
                } />
                <Route path="/seizedcustomer" element={
                  <ProtectedRoute>
                    <Customers />
                  </ProtectedRoute>
                } />
                <Route path="/customers/:customerId" element={
                  <ProtectedRoute>
                    <CustomerDetails />
                  </ProtectedRoute>
                } />
                <Route path="/vehicle" element={
                  <ProtectedRoute>
                    <VehiclesPage />
                  </ProtectedRoute>
                } />
                <Route path="/vehicles" element={
                  <ProtectedRoute>
                    <VehiclesPage />
                  </ProtectedRoute>
                } />
                <Route path="/vehicles/:id" element={
                  <ProtectedRoute>
                    <VehiclesPage />
                  </ProtectedRoute>
                } />
                <Route path="/vehicle/:id" element={
                  <ProtectedRoute>
                    <VehiclesPage />
                  </ProtectedRoute>
                } />
                <Route path="/vehicles/:id/host" element={
                  <ProtectedRoute>
                    <VehiclesPage />
                  </ProtectedRoute>
                } />
                <Route path="/vehicle/:id/host" element={
                  <ProtectedRoute>
                    <VehiclesPage />
                  </ProtectedRoute>
                } />
                <Route path="/office-expense" element={
                  <ProtectedRoute>
                    <OfficeExpencePage />
                  </ProtectedRoute>
                } />

                {/* <Route path="/ChangePasswordForm" element={
                    <ProtectedRoute allowedRoles={['owner']}>
                      <ChangePasswordForm onClose={20000 }/>
                    </ProtectedRoute>
                  } /> */}
                <Route path="/AddCustomersForm" element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <AddCustomerForm />
                  </ProtectedRoute>
                } />
                <Route path="/owner/customers/:customerId" element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <CustomerDetails />
                  </ProtectedRoute>
                } />
                <Route path="/customers/edit/:hplno" element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <EditCustomer />
                  </ProtectedRoute>
                } />
                <Route path="/customers/Cunsultingedit/:hplno" element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <ConsultingEdit />
                  </ProtectedRoute>
                } />
                <Route path="/customers/VehicleLoanedit/:hplno" element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <VehicleLoanEdit />
                  </ProtectedRoute>
                } />
                <Route path="/UserProfile" element={
                  <ProtectedRoute>
                    <UserProfile />
                  </ProtectedRoute>
                } />
                {/* Collections */}
                <Route path="/collections/pending" element={<ProtectedRoute><PendingCollections /></ProtectedRoute>} />
                <Route path="/collections/kyc" element={<ProtectedRoute><KYCPending /></ProtectedRoute>} />
                <Route path="/collections/terminated" element={<ProtectedRoute><Terminated /></ProtectedRoute>} />
                <Route path="/collections/godown" element={<ProtectedRoute><GodownVehicle /></ProtectedRoute>} />

                {/* Reports */}
                <Route path="/reports/collection" element={<ProtectedRoute><CollectionReport /></ProtectedRoute>} />
                <Route path="/reports/activity" element={<ProtectedRoute><ActivityLog /></ProtectedRoute>} />
                <Route path="/reports/revenue" element={<ProtectedRoute><Revenue /></ProtectedRoute>} />
                <Route path="/reports/due-analysis" element={<ProtectedRoute><DueAnalysis /></ProtectedRoute>} />
                <Route path="/reports/compliance" element={<ProtectedRoute><Compliance /></ProtectedRoute>} />
                <Route path="/reports/charges" element={<ProtectedRoute><Charges /></ProtectedRoute>} />
                <Route path="/reports/balances" element={<ProtectedRoute><Balances /></ProtectedRoute>} />
                <Route path="/reports/bill" element={<ProtectedRoute><Bill /></ProtectedRoute>} />

                {/* Accounts */}
                <Route path="/accounts/ledger" element={<Ledger />} />
                <Route path="/accounts/ledger-groups" element={<LedgerGroups />} />
                <Route path="/accounts/vouchers" element={<Vouchers />} />
                <Route path="/accounts/daybook" element={<ProtectedRoute><DayBook /></ProtectedRoute>} />
                <Route path="/accounts/statements" element={<ProtectedRoute><Statements /></ProtectedRoute>} />
                <Route path="/accounts/business" element={<ProtectedRoute><Business /></ProtectedRoute>} />
                <Route path="/accounts/demand" element={<ProtectedRoute><Demand /></ProtectedRoute>} />
                <Route path="/accounts/balance-sheet" element={<ProtectedRoute><BalanceSheet /></ProtectedRoute>} />
                <Route path="/accounts/trial-balance" element={<ProtectedRoute><TrialBalance /></ProtectedRoute>} />
                <Route path="/accounts/pnl" element={<ProtectedRoute><ProfitLoss /></ProtectedRoute>} />
                <Route path="/accounts/ledger" element={<ProtectedRoute><Ledger /></ProtectedRoute>} />
                <Route path="/accounts/cash-flow" element={<ProtectedRoute><CashFlow /></ProtectedRoute>} />
                {/* AI Assistant */}
                <Route path="/ai/dashboard" element={<ProtectedRoute><AIDashboard /></ProtectedRoute>} />
                <Route path="/ai/lead-calling" element={<ProtectedRoute><LeadCalling /></ProtectedRoute>} />
                <Route path="/ai/logs" element={<ProtectedRoute><AILogs /></ProtectedRoute>} />
                <Route path="/ai/insights" element={<ProtectedRoute><AIInsights /></ProtectedRoute>} />
                <Route path="/ai/settings" element={<ProtectedRoute><AISettings /></ProtectedRoute>} />
                {/* Customer Locator */}
                <Route path="/locator/track" element={<ProtectedRoute><CustomerTrack /></ProtectedRoute>} />
                <Route path="/locator/alerts" element={<ProtectedRoute><CustomerAlerts /></ProtectedRoute>} />
                <Route path="/locator/insights" element={<ProtectedRoute><CustomerInsights /></ProtectedRoute>} />
                <Route path="/locator/live" element={<ProtectedRoute><CustomerLiveMap /></ProtectedRoute>} />
                {/* Other */}
                <Route path="/notices" element={<ProtectedRoute><Notices /></ProtectedRoute>} />
                <Route path="/loans" element={<ProtectedRoute><Loans /></ProtectedRoute>} />
                <Route path="/loanRequests" element={<ProtectedRoute><LoanRequests /></ProtectedRoute>} />
                {/* Agent Management */}
                {/* Owner-only routes */}
                <Route path="/AgentManagement" element={
                  <ProtectedRoute allowedRoles={['owner']}>
                    <AgentManagement />
                  </ProtectedRoute>
                } />
                <Route path="/agents/assign" element={<ProtectedRoute><AssignCustomers /></ProtectedRoute>} />
                <Route path="/agents/areas" element={<ProtectedRoute><AreaAllocation /></ProtectedRoute>} />
                <Route path="/agents/history" element={<ProtectedRoute><AssignmentHistory /></ProtectedRoute>} />
                <Route path="/agents/location" element={<ProtectedRoute><StaffLocationReport /></ProtectedRoute>} />
                <Route path="/agents/login" element={<ProtectedRoute><StaffLoginReport /></ProtectedRoute>} />
                {/* Master */}
                <Route path="/master/company" element={
                  <ProtectedRoute allowedRoles={['owner']} requireOwnerSession={true}>
                    <CompanyProfile />
                  </ProtectedRoute>
                } />
                <Route path="/master/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                <Route path="/master/rsp" element={<ProtectedRoute><RSPBankMaster /></ProtectedRoute>} />
                <Route path="/master/hand-loan" element={<ProtectedRoute><HandLoan /></ProtectedRoute>} />
                <Route path="/master/bad-debts" element={<ProtectedRoute><BadDebts /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            {/* </main> */}
          </ErrorBoundary>
          <CrudModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
      </DrillDownProvider>
    </AuthProvider>
  );
}

function App() {
  return (
    <HashRouter>
      <OwnerAuthProvider>
        <AppContent />
        <RouteDebug />
      </OwnerAuthProvider>
    </HashRouter>
  );
}

export default App;