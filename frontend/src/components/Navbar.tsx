// //import React from 'react';
// import { NavLink } from 'react-router-dom';
// import { LayoutDashboard, Users/*, FileText*/ } from 'lucide-react';

// const Navbar = () => {
//   const navItems = [
//     { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
//     { to: '/customers', icon: Users, label: 'Customers' },
//   ];

//   return (
//     <nav className="flex space-x-4">
//       {navItems.map(({ to, icon: Icon, label }) => (
//         <NavLink
//           key={to}
//           to={to}
//           className={({ isActive }) =>
//             `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
//               isActive
//                 ? 'bg-blue-100 text-blue-700'
//                 : 'text-gray-600 hover:bg-gray-100'
//             }`
//           }
//         >
//           <Icon className="h-4 w-4" />
//           <span>{label}</span>
//         </NavLink>
//       ))}
//     </nav>
//   );
// };

// export default Navbar;
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Menu, X, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {useFinanceAuth} from '../contexts/FinanceAuthContext'

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, userLogout } = useAuth();
  const { finance, financeLogout } = useFinanceAuth();
  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/customers', icon: Users, label: 'Customers' },
    { to: '/paymentReport', icon: Users, label: 'PaymentReport' },
  ];

  const handleLogout = () => {
    userLogout();
    setIsOpen(false);
    // You might want to redirect to login page after logout
    // You can use navigate from react-router if needed
  };
  const handleFinanceLogout = () => {
    financeLogout();
    setIsOpen(false);
    // You might want to redirect to login page after logout
    // You can use navigate from react-router if needed
  };


  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden flex justify-end p-4">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center justify-center p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none"
        >
          {isOpen ? (
            <X className="h-6 w-6" />
          ) : (
            <Menu className="h-6 w-6" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`${isOpen ? 'block' : 'hidden'} md:flex md:space-x-4`}>
        <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-4 px-4 pb-4 md:p-0">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium ${
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`
              }
              onClick={() => setIsOpen(false)}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </NavLink>
          ))}

          {/* Logout button - only shown when user is logged in */}
          {user && (
            <button
              onClick={handleLogout}
              className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          )}
          {finance && (
            <button
              onClick={handleFinanceLogout}
              className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              <LogOut className="h-4 w-4" />
              <span>Finance Logout</span>
            </button>
          )}
        </div>
      </nav>
    </>
  );
};

export default Navbar;