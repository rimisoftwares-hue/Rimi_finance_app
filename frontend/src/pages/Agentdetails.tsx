import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';

const App = () => {
      const [user, setUser] = useState<any>(null);
      const [token, setToken] = useState(localStorage.getItem('token') || '');
      const [view, setView] = useState('login');
      const [message, setMessage] = useState('');

      useEffect(() => {
        if (token) {
          // Verify token and get user info via apiClient
          apiClient.get('/auth/verify')
          .then(response => setUser(response.data.user))
          .catch(() => {
            localStorage.removeItem('token');
            setToken('');
          });
        }
      }, [token]);

      const handleLogout = () => {
        localStorage.removeItem('token');
        setToken('');
        setUser(null);
        setView('login');
      };

      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
            {message && (
              <div className={`mb-4 p-4 rounded ${message.includes('error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {message}
              </div>
            )}
            {user ? (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h1 className="text-2xl font-bold text-gray-800">Welcome, {user.email}</h1>
                  <button
                    onClick={handleLogout}
                    className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 transition"
                  >
                    Logout
                  </button>
                </div>
                {user.role === 'owner' && (
                  <button
                    onClick={() => setView('createUser')}
                    className="w-full bg-blue-500 text-white px-4 py-2 rounded mb-4 hover:bg-blue-600 transition"
                  >
                    Create New User
                  </button>
                )}
                <button
                  onClick={() => setView('changePassword')}
                  className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
                >
                  Change Password
                </button>
                {view === 'changePassword' && (
                  <ChangePassword setMessage={setMessage} token={token} setView={setView} />
                )}
                {view === 'createUser' && user.role === 'owner' && (
                  <CreateUser setMessage={setMessage} token={token} setView={setView} />
                )}
              </>
            ) : (
              <>
                {view === 'login' && (
                  <Login setUser={setUser} setToken={setToken} setMessage={setMessage} setView={setView} />
                )}
                {view === 'requestReset' && (
                  <RequestReset setMessage={setMessage} setView={setView} />
                )}
                {view === 'resetPassword' && (
                  <ResetPassword setMessage={setMessage} setView={setView} />
                )}
              </>
            )}
          </div>
        </div>
      );
    };

    // Login Component