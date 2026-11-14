import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, isDirectUserMode } from '../contexts/AuthContext';
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
}) => {
  const { user, isLoading: userLoading } = useAuth();
  const { owner, isLoading: ownerLoading } = useOwnerAuth();
  const location = useLocation();

  if (ownerLoading || userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const directMode = isDirectUserMode();

  // Every protected route requires an authenticated user session
  if (!user) {
    if (owner && !directMode) {
      return <Navigate to="/user-login" state={{ from: location }} replace />;
    }
    return <Navigate to="/owner-login" state={{ from: location }} replace />;
  }

  // Owner-only / owner-session-required route enforcement:
  // Permitted in License Mode when `owner` is active AND `user.role === 'owner'`,
  // OR in Direct User Mode when `user.role === 'owner'`.
  const isOwnerOnlyRoute = allowedRoles.length === 1 && allowedRoles[0] === 'owner';
  if (requireOwnerSession || isOwnerOnlyRoute) {
    if (user.role !== 'owner') {
      return <Navigate to="/unauthorized" state={{ from: location }} replace />;
    }
    if (!directMode && !owner) {
      return <Navigate to="/owner-login" state={{ from: location }} replace />;
    }
  }

  // Role authorization check
  if (allowedRoles.length > 0 && (!user.role || !allowedRoles.includes(user.role))) {
    return <Navigate to="/unauthorized" state={{ from: location }} replace />;
  }

  // Canonicalize '/' -> '/dashboard' when user is authenticated
  if (location.pathname === '/' && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
