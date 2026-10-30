// import React from 'react';
// import { Navigate, useLocation } from 'react-router-dom';
// import { useAuth } from '../contexts/AuthContext';

// interface ProtectedRouteProps {
//   children: React.ReactNode;
//   allowedRoles?: ('owner' | 'agent')[];
// }

// const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
//   children, 
//   allowedRoles = ['owner', 'agent'] 
// }) => {
//   const { user, isLoading } = useAuth();
//   const location = useLocation();

//   // Show loading state
//   if (isLoading) {
//     return (
//       <div className="min-h-screen flex items-center justify-center bg-gray-50">
//         <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
//       </div>
//     );
//   }

//   // Redirect to login if not authenticated
//   if (!user) {
//     return <Navigate to="/login" state={{ from: location }} replace />;
//   }

//   // Check if user role is allowed
//   if (!allowedRoles.includes(user.role)) {
//     return <Navigate to="/unauthorized" replace />;
//   }

//   // Render children if authenticated and authorized
//   return <>{children}</>;
// };

// export default ProtectedRoute;

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOwnerAuth } from '../contexts/OwnerAuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('owner' | 'agent' | 'admin' | 'staff')[];
  requireOwnerSession?: boolean;
  requireUser?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  allowedRoles = ['owner', 'agent', 'admin', 'staff'],
  requireOwnerSession = false,
  requireUser = false
}) => {
  const { user, isLoading: userLoading } = useAuth();
  const { owner, isLoading: ownerLoading } = useOwnerAuth();
  const location = useLocation();

  // Show loading state
  if (ownerLoading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // =================== REQUIRE OWNER SESSION ===================
  // If owner session is required, or if route is strictly owner-only, owner must exist
  const isOwnerOnlyRoute = allowedRoles.length === 1 && allowedRoles[0] === 'owner';
  if ((requireOwnerSession || isOwnerOnlyRoute) && !owner) {
    return <Navigate to="/owner-login" state={{ from: location }} replace />;
  }

  // =================== ROLE AUTHORIZATION CHECK ===================
  // If a user session is active, verify that their user role is permitted
  if (user) {
    if (allowedRoles.length > 0 && user.role && !allowedRoles.includes(user.role)) {
      return <Navigate to="/unauthorized" state={{ from: location }} replace />;
    }
  }

  // =================== REQUIRE USER SESSION ===================
  if (requireUser) {
    if (!user) {
      if (owner) {
        return <Navigate to="/user-login" state={{ from: location }} replace />;
      }
      return <Navigate to="/owner-login" state={{ from: location }} replace />;
    }
  }

  // If this is strictly an owner-only route, and user is logged in as non-owner (e.g. agent/staff)
  if (isOwnerOnlyRoute && user && user.role !== 'owner') {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />;
  }

  // =================== REDIRECT LOGIC ===================
  // If user is logged in and tries to access user-login, redirect to dashboard
  if (location.pathname === '/user-login' && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // If owner is logged in but no user, and tries to access dashboard, redirect to user-login
  if (location.pathname === '/dashboard' && owner && !user) {
    return <Navigate to="/user-login" replace />;
  }

  // If on homepage ('/') and owner is logged in but no user, redirect to user-login
  if (location.pathname === '/' && owner && !user) {
    return <Navigate to="/user-login" replace />;
  }

  // If on homepage ('/') and user is logged in, redirect to dashboard
  if (location.pathname === '/' && user) {
    return <Navigate to="/dashboard" replace />;
  }

  // =================== RENDER CHILDREN ===================
  return <>{children}</>;
};

export default ProtectedRoute;