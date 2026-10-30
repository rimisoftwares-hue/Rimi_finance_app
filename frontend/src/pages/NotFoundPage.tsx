import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Home, 
  ArrowLeft, 
  AlertTriangle, 
  Compass, 
  Search,
  RefreshCw
} from 'lucide-react';
import { Button } from '../components/ui/button';

const NotFoundPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {/* Animated 404 */}
        <div className="relative mb-8">
          <div className="text-[180px] md:text-[240px] font-bold text-gray-200 dark:text-gray-700 leading-none select-none">
            404
          </div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <AlertTriangle className="h-32 w-32 mx-auto text-yellow-500 dark:text-yellow-400 mb-4 animate-pulse" />
              <h1 className="text-4xl md:text-5xl font-bold text-gray-800 dark:text-white mb-4">
                Page Not Found
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 max-w-lg mx-auto">
                Oops! The page you're looking for seems to have wandered off into the digital wilderness.
              </p>
            </div>
          </div>
        </div>

        {/* Search bar */}
        <div className="mb-10">
          <div className="relative max-w-md mx-auto">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search for pages..."
              className="block w-full pl-10 pr-3 py-4 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              readOnly
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <kbd className="px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
                Ctrl + K
              </kbd>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow border border-gray-200 dark:border-gray-700">
            <div className="h-12 w-12 mx-auto bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mb-4">
              <Home className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Go Home
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Return to the main dashboard
            </p>
            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
            >
              Dashboard
            </Button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow border border-gray-200 dark:border-gray-700">
            <div className="h-12 w-12 mx-auto bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mb-4">
              <ArrowLeft className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Go Back
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Return to the previous page
            </p>
            <Button
              onClick={() => navigate(-1)}
              variant="outline"
              className="w-full border-green-600 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
            >
              Back
            </Button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow border border-gray-200 dark:border-gray-700">
            <div className="h-12 w-12 mx-auto bg-purple-100 dark:bg-purple-900 rounded-full flex items-center justify-center mb-4">
              <RefreshCw className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Reload
            </h3>
            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
              Refresh the current page
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full border-purple-600 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20"
            >
              Refresh
            </Button>
          </div>
        </div>

        {/* Helpful links */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center justify-center">
            <Compass className="h-5 w-5 mr-2" />
            Popular Pages
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              variant="ghost"
              onClick={() => navigate('/customers')}
              className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Customers
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/loanApplications')}
              className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Loan Applications
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/paymentReport')}
              className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Payment Reports
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/unpaidloans')}
              className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Unpaid Loans
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/vehicle')}
              className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Vehicles
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate('/profile')}
              className="text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Profile
            </Button>
          </div>
        </div>

        {/* Error details (hidden by default) */}
        <details className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 mb-8 cursor-pointer">
          <summary className="text-gray-700 dark:text-gray-300 font-medium">
            Technical Details
          </summary>
          <div className="mt-4 text-left">
            <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-4 font-mono text-sm overflow-x-auto">
              <div className="text-gray-800 dark:text-gray-300">
                <div>Error: Page not found (404)</div>
                <div>Path: {window.location.pathname}</div>
                <div>Timestamp: {new Date().toLocaleString()}</div>
                <div className="mt-2 text-gray-600 dark:text-gray-400">
                  If this error persists, please contact support.
                </div>
              </div>
            </div>
          </div>
        </details>

        {/* Contact support */}
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Can't find what you're looking for?
          </p>
          <Button
            variant="outline"
            onClick={() => {
              // You can implement a contact support modal or email here
              window.location.href = 'mailto:support@example.com';
            }}
            className="border-gray-300 dark:border-gray-600"
          >
            Contact Support
          </Button>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-100 dark:bg-blue-900/20 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-3xl opacity-30 animate-blob"></div>
        <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-purple-100 dark:bg-purple-900/20 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-1/4 left-1/2 w-64 h-64 bg-pink-100 dark:bg-pink-900/20 rounded-full mix-blend-multiply dark:mix-blend-overlay filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>
      </div>
    </div>
  );
};

export default NotFoundPage;