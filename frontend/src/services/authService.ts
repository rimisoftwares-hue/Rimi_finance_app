import { jwtDecode } from 'jwt-decode';
import apiClient from '../api/apiClient';

export interface User {
  id: string;
  email: string;
  role: 'owner' | 'agent';
}

export interface DecodedToken {
  user: User;
  exp: number;
  iat: number;
}

// Check if token is valid and not expired
export const isTokenValid = (token: string): boolean => {
  try {
    const decoded = jwtDecode<DecodedToken>(token);
    const currentTime = Date.now() / 1000;
    
    return decoded.exp > currentTime;
  } catch { 
    return false;
  }
};

// Get user from token
export const getUserFromToken = (token: string): User | null => {
  try {
    const decoded = jwtDecode<DecodedToken>(token);
    return decoded.user;
  } catch {
    return null;
  }
};

// Login service
export const login = async (email: string, password: string): Promise<{ token: string; user: User } | null> => {
  try {
    const response = await apiClient.post('/auth/login', { email, password });
    const { token } = response.data;
    
    localStorage.setItem('authToken', token);
    
    // Get user from token
    const user = getUserFromToken(token);
    
    if (!user) {
      throw new Error('Invalid user data in token');
    }
    
    return { token, user };
  } catch (error) {
    console.error('Login error:', error);
    return null;
  }
};

// Request password reset
export const requestPasswordReset = async (email: string): Promise<boolean> => {
  try {
    const response = await apiClient.post('/auth/request-reset', { email });
    return response.data.success;
  } catch (error) {
    console.error('Password reset request error:', error);
    return false;
  }
};

// Reset password with token
export const resetPassword = async (token: string, newPassword: string): Promise<boolean> => {
  try {
    const response = await apiClient.post('/auth/reset-password', { 
      token, 
      newPassword 
    });
    return response.data.success;
  } catch (error) {
    console.error('Password reset error:', error);
    return false;
  }
};

// Change password (for authenticated users)
export const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
  try {
    const response = await apiClient.post('/auth/change-password', {
      currentPassword,
      newPassword
    });
    return response.data.success;
  } catch (error) {
    console.error('Change password error:', error);
    return false;
  }
};