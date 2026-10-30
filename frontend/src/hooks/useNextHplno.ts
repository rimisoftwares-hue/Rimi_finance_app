// hooks/useNextHplno.ts
import { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

export const useNextHplno = () => {
  const [nextHplno, setNextHplno] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNextHplno = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.get('/customers/next-hplno');

        if (response.data.success) {
          setNextHplno(response.data.nextHplno.toString());
        }
      } catch (err: any) {
        console.error('Failed to fetch next HPL number:', err);
        setError(err.response?.data?.error || 'Failed to generate HPL number');
        // Fallback: start from 1 if API fails
        setNextHplno('1');
      } finally {
        setLoading(false);
      }
    };

    fetchNextHplno();
  }, []);

  return { nextHplno, loading, error };
};