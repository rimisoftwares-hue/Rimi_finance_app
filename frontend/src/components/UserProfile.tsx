import React, { useState, useRef, useEffect } from 'react';
import { 
  User, Settings, LogOut, ChevronDown, 
  Shield, Briefcase, Mail, Phone, Calendar,
  Building, Users, Clock, Sun, Moon, KeyRound
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { JoinWithCodeDialog } from './invitations/JoinWithCodeDialog';

export function UserProfile() {
  const { user, currentFinance, userLogout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check dark mode preference
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setDarkMode(isDarkMode);
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    document.documentElement.classList.toggle('dark');
    localStorage.setItem('darkMode', newDarkMode.toString());
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'admin': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'agent': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'staff': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const handleLogout = () => {
    userLogout();
    navigate('/user-login');
  };

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
          <User className="h-4 w-4 text-white" />
        </div>
        <div className="hidden md:flex flex-col items-start">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {user.username}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
          {/* User Info Header */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-start space-x-4">
              <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                <User className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                    {user.username}
                  </h3>
                  <span className={`text-xs px-2 py-1 rounded-full ${getRoleColor(user.role)}`}>
                    {user.role.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1 flex items-center">
                  <Mail className="h-3 w-3 mr-1" />
                  {user.email}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1 flex items-center">
                  <Phone className="h-3 w-3 mr-1" />
                  {user.phone_no}
                </p>
              </div>
            </div>

            {/* Current Finance */}
            {currentFinance && (
              <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center space-x-2 text-sm">
                  <Building className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {currentFinance.name}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {currentFinance.address}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Menu Items */}
          <div className="py-2">
            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="w-full px-4 py-3 flex items-center justify-between text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center">
                {darkMode ? (
                  <Sun className="h-4 w-4 mr-3 text-yellow-500" />
                ) : (
                  <Moon className="h-4 w-4 mr-3 text-gray-500" />
                )}
                <span>{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
              </div>
              <div className="relative inline-flex items-center">
                <div className={`w-12 h-6 rounded-full transition-colors ${darkMode ? 'bg-blue-600' : 'bg-gray-300'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${darkMode ? 'right-1' : 'left-1'}`} />
                </div>
              </div>
            </button>

            {/* Join with Code */}
            <button
              onClick={() => {
                setIsOpen(false);
                setJoinCodeOpen(true);
              }}
              className="w-full px-4 py-3 flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <KeyRound className="h-4 w-4 mr-3 text-emerald-500" />
              <span>Join with Code</span>
            </button>

            {/* User Management (for owners/admins) */}
            {(user.role === 'owner' || user.role === 'admin') && (
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/AgentManagement');
                }}
                className="w-full px-4 py-3 flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Users className="h-4 w-4 mr-3 text-blue-500" />
                <span>User Management</span>
              </button>
            )}

            {/* Settings */}
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="w-full px-4 py-3 flex items-center text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Settings className="h-4 w-4 mr-3 text-gray-500" />
              <span>Settings</span>
            </button>

            {/* Logout Button */}
            <div className="border-t border-gray-100 dark:border-gray-700 mt-2 pt-2">
              <button
                onClick={handleLogout}
                className="w-full px-4 py-3 flex items-center text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="h-4 w-4 mr-3" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center">
                <Calendar className="h-3 w-3 mr-1" />
                Joined {new Date(user.created_at).toLocaleDateString()}
              </div>
              <div className="flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {user.last_login 
                  ? `Last login: ${new Date(user.last_login).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'First login'
                }
              </div>
            </div>
          </div>
        </div>
      )}

      <JoinWithCodeDialog
        open={joinCodeOpen}
        onOpenChange={setJoinCodeOpen}
      />
    </div>
  );
}