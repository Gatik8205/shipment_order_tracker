import { createContext, useContext, useEffect, useState } from 'react';
import { me } from '../api/auth.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  // loading stays true until the startup token-validation is done.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    // Validate the stored token by fetching the current user.
    me()
      .then((userData) => setUser(userData))
      .catch(() => {
        // Token invalid or expired — clear it.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []); // Run once on mount.

  /** Called after a successful login or register response. */
  function login(newToken, newUser) {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
