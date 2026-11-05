import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/apiClient';

interface Owner {
  id: number;
  username: string;
}

interface OwnerAuthContextType {
  owner: Owner | null;
  isLoading: boolean;
  ownerLogin: (username: string, password: string) => Promise<boolean>;
  ownerLogout: () => void;
}

const OwnerAuthContext = createContext<OwnerAuthContextType | undefined>(undefined);

export const OwnerAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [owner, setOwner] = useState<Owner | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setOwnerFinanceList] = useState<any[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('ownerToken');
    if (token) {
      try {
        const decoded: any = jwtDecode(token);
        setOwner(decoded.owner);

        // Fetch finance list for this owner
        fetchOwnerFinances();
      } catch (error) {
        console.error('Invalid owner token:', error);
        localStorage.removeItem('ownerToken');
      }
    }
    setIsLoading(false);
  }, []);

  const fetchOwnerFinances = async () => {
    try {
      const response = await apiClient.get('/auth/owner-finances');

      if (response.data.success) {
        setOwnerFinanceList(response.data.finances);
        // Store in localStorage for quick access
        localStorage.setItem('ownerFinances', JSON.stringify(response.data.finances));
      }
    } catch (error) {
      console.error('Error fetching owner finances:', error);
    }
  };

  const ownerLogin = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await apiClient.post('/auth/owner-login', {
        username,
        password
      });

      if (response.data.success) {
        const { token, owner } = response.data;
        localStorage.setItem('ownerToken', token);
        setOwner(owner);

        // Fetch and store finance list
        await fetchOwnerFinances();

        return true;
      }
      return false;
    } catch (error) {
      console.error('Owner login error:', error);
      return false;
    }
  };

  const ownerLogout = () => {
    localStorage.removeItem('ownerToken');
    localStorage.removeItem('ownerFinances');
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentFinance');
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userData');
    sessionStorage.removeItem('financeData');
    sessionStorage.removeItem('currentFinance');
    sessionStorage.removeItem('statistics');
    sessionStorage.removeItem('currentFinanceId');
    sessionStorage.removeItem('lastLogin');
    sessionStorage.removeItem('lastKnownLocation');
    setOwner(null);
    setOwnerFinanceList([]);
  };

  return (
    <OwnerAuthContext.Provider value={{ owner, isLoading, ownerLogin, ownerLogout }}>
      {children}
    </OwnerAuthContext.Provider>
  );
};

export const useOwnerAuth = () => {
  const context = useContext(OwnerAuthContext);
  if (!context) {
    throw new Error('useOwnerAuth must be used within an OwnerAuthProvider');
  }
  return context;
};