import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface RoleBasedViewProps {
  ownerContent: ReactNode;
  agentContent: ReactNode;
  fallbackContent?: ReactNode;
}

/**
 * Component to conditionally render content based on user role
 */
const RoleBasedView: React.FC<RoleBasedViewProps> = ({ 
  ownerContent, 
  agentContent, 
  fallbackContent = null 
}) => {
  const { user } = useAuth();
  
  if (!user) {
    return <>{fallbackContent}</>;
  }
  
  if (user.role === 'owner') {
    return <>{ownerContent}</>;
  }
  
  if (user.role === 'agent') {
    return <>{agentContent}</>;
  }
  
  return <>{fallbackContent}</>;
};

export default RoleBasedView;