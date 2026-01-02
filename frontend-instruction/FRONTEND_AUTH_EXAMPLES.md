# Frontend Authentication Examples

This document provides secure frontend implementation examples for the UNITE authentication system.

## Security Principles

1. **Minimal localStorage**: Store only the token, never user data
2. **Memory-only user state**: User data in React Context/State, cleared on refresh
3. **Server-side authorization**: All permission checks via API endpoints
4. **Session revalidation**: Re-fetch user data on app load and page refresh

## AuthService Example

```javascript
/**
 * Secure Authentication Service
 * 
 * This service handles authentication with minimal client-side storage.
 * User data is never persisted to localStorage - only the token is stored.
 */
class AuthService {
  constructor(baseURL = 'http://localhost:3000/api') {
    this.baseURL = baseURL;
  }

  /**
   * Store token in localStorage (only non-sensitive data)
   */
  setToken(token) {
    if (token) {
      localStorage.setItem('token', token);
    }
  }

  /**
   * Get token from localStorage
   */
  getToken() {
    return localStorage.getItem('token');
  }

  /**
   * Remove token from localStorage
   */
  removeToken() {
    localStorage.removeItem('token');
    // Also clear any old user data that might exist (migration cleanup)
    localStorage.removeItem('user');
  }

  /**
   * Check if user is authenticated (has valid token)
   * Note: This only checks for token presence, not validity
   * Always validate with server via validateSession()
   */
  hasToken() {
    return !!this.getToken();
  }

  /**
   * Login user
   * Returns minimal user data - full data should be fetched via getCurrentUser()
   */
  async login(email, password) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (data.success) {
      // Store ONLY the token - do NOT store user data
      this.setToken(data.token);
      
      // Return minimal user data for immediate UI display
      return {
        success: true,
        token: data.token,
        user: data.user // { id, email, displayName }
      };
    }

    throw new Error(data.message || 'Login failed');
  }

  /**
   * Get current user from server
   * This should be called after login and on app load to get fresh user data
   * DO NOT persist the returned data to localStorage
   */
  async getCurrentUser() {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    const response = await fetch(`${this.baseURL}/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (response.status === 401) {
      // Token is invalid/expired - clear storage
      this.removeToken();
      return null;
    }

    const data = await response.json();
    return data.success ? data.user : null;
  }

  /**
   * Validate current session
   * Call this on app load to ensure token is still valid
   */
  async validateSession() {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    try {
      const user = await this.getCurrentUser();
      return user;
    } catch (error) {
      this.removeToken();
      return null;
    }
  }

  /**
   * Logout user
   */
  async logout() {
    const token = this.getToken();
    
    // Call logout endpoint (optional - mainly clears server-side cookies)
    if (token) {
      try {
        await fetch(`${this.baseURL}/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      } catch (error) {
        // Ignore errors - client-side cleanup is most important
      }
    }

    // Clear client-side storage
    this.removeToken();
  }

  /**
   * Check if user has a specific permission
   * Always queries the server - never uses cached permission data
   */
  async checkPermission(resource, action, locationId = null) {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseURL}/permissions/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ resource, action, locationId })
      });

      const data = await response.json();
      return data.success && data.hasPermission === true;
    } catch (error) {
      console.error('Permission check error:', error);
      return false;
    }
  }

  /**
   * Check if user can access a specific page
   * Always queries the server - never uses cached permission data
   */
  async checkPageAccess(pageRoute, locationId = null) {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const url = new URL(`${this.baseURL}/pages/check/${pageRoute}`, window.location.origin);
      if (locationId) {
        url.searchParams.set('locationId', locationId);
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      return data.success && data.canAccess === true;
    } catch (error) {
      console.error('Page access check error:', error);
      return false;
    }
  }

  /**
   * Check if user can use a specific feature
   * Always queries the server - never uses cached permission data
   */
  async checkFeature(featureCode, locationId = null) {
    const token = this.getToken();
    if (!token) {
      return false;
    }

    try {
      const url = new URL(`${this.baseURL}/features/check/${featureCode}`, window.location.origin);
      if (locationId) {
        url.searchParams.set('locationId', locationId);
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      return data.success && data.canUse === true;
    } catch (error) {
      console.error('Feature check error:', error);
      return false;
    }
  }

  /**
   * Get all accessible pages for the current user
   */
  async getAccessiblePages(locationId = null) {
    const token = this.getToken();
    if (!token) {
      return [];
    }

    try {
      const url = new URL(`${this.baseURL}/pages/accessible`, window.location.origin);
      if (locationId) {
        url.searchParams.set('locationId', locationId);
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      return data.success ? data.data : [];
    } catch (error) {
      console.error('Get accessible pages error:', error);
      return [];
    }
  }

  /**
   * Get all available features for the current user
   */
  async getAvailableFeatures(locationId = null) {
    const token = this.getToken();
    if (!token) {
      return [];
    }

    try {
      const url = new URL(`${this.baseURL}/features/available`, window.location.origin);
      if (locationId) {
        url.searchParams.set('locationId', locationId);
      }

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await response.json();
      return data.success ? data.data : [];
    } catch (error) {
      console.error('Get available features error:', error);
      return [];
    }
  }

  /**
   * Refresh access token
   * Call this before token expires to extend the session
   */
  async refreshToken() {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.status === 401) {
        // Token is invalid/expired - clear storage
        this.removeToken();
        return null;
      }

      const data = await response.json();
      if (data.success) {
        // Update stored token
        this.setToken(data.token);
        return {
          token: data.token,
          user: data.user
        };
      }

      return null;
    } catch (error) {
      console.error('Token refresh error:', error);
      this.removeToken();
      return null;
    }
  }
}

export default AuthService;
```

## React Context Example

```javascript
import React, { createContext, useContext, useState, useEffect } from 'react';
import AuthService from '../services/AuthService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authService = new AuthService(process.env.REACT_APP_API_URL || 'http://localhost:3000/api');

  /**
   * Validate session on mount and revalidate on focus
   */
  useEffect(() => {
    validateSession();

    // Revalidate when window regains focus (user returns to tab)
    const handleFocus = () => {
      validateSession();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  /**
   * Validate current session by fetching fresh user data from server
   */
  const validateSession = async () => {
    setLoading(true);
    try {
      const userData = await authService.validateSession();
      setUser(userData);
    } catch (error) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Login user
   */
  const login = async (email, password) => {
    try {
      const result = await authService.login(email, password);
      
      // After login, fetch full user data
      const userData = await authService.getCurrentUser();
      setUser(userData);
      
      return result;
    } catch (error) {
      throw error;
    }
  };

  /**
   * Refresh access token
   */
  const refreshToken = async () => {
    try {
      const result = await authService.refreshToken();
      if (result) {
        // Token was refreshed successfully
        return result;
      }
      return null;
    } catch (error) {
      // Token refresh failed - user needs to login again
      setUser(null);
      return null;
    }
  };

  /**
   * Logout user
   */
  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  /**
   * Check permission (queries server)
   */
  const checkPermission = async (resource, action, locationId = null) => {
    return await authService.checkPermission(resource, action, locationId);
  };

  /**
   * Check page access (queries server)
   */
  const checkPageAccess = async (pageRoute, locationId = null) => {
    return await authService.checkPageAccess(pageRoute, locationId);
  };

  /**
   * Check feature access (queries server)
   */
  const checkFeature = async (featureCode, locationId = null) => {
    return await authService.checkFeature(featureCode, locationId);
  };

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshToken,
    validateSession,
    checkPermission,
    checkPageAccess,
    checkFeature
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

## React Hooks Examples

### usePermission Hook

```javascript
import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

/**
 * Hook to check if user has a specific permission
 * Always queries the server - never uses cached data
 */
export function usePermission(resource, action, locationId = null) {
  const { checkPermission } = useAuth();
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      setLoading(true);
      const result = await checkPermission(resource, action, locationId);
      if (mounted) {
        setHasPermission(result);
        setLoading(false);
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, [resource, action, locationId, checkPermission]);

  return { hasPermission, loading };
}
```

### usePageAccess Hook

```javascript
import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

/**
 * Hook to check if user can access a specific page
 * Always queries the server - never uses cached data
 */
export function usePageAccess(pageRoute, locationId = null) {
  const { checkPageAccess } = useAuth();
  const [canAccess, setCanAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      setLoading(true);
      const result = await checkPageAccess(pageRoute, locationId);
      if (mounted) {
        setCanAccess(result);
        setLoading(false);
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, [pageRoute, locationId, checkPageAccess]);

  return { canAccess, loading };
}
```

### useFeature Hook

```javascript
import { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

/**
 * Hook to check if user can use a specific feature
 * Always queries the server - never uses cached data
 */
export function useFeature(featureCode, locationId = null) {
  const { checkFeature } = useAuth();
  const [canUse, setCanUse] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      setLoading(true);
      const result = await checkFeature(featureCode, locationId);
      if (mounted) {
        setCanUse(result);
        setLoading(false);
      }
    };

    check();

    return () => {
      mounted = false;
    };
  }, [featureCode, locationId, checkFeature]);

  return { canUse, loading };
}
```

## Protected Route Component

```javascript
import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { usePageAccess } from '../hooks/usePageAccess';

/**
 * ProtectedRoute component that checks page access via API
 * Never relies on localStorage permission data
 */
export function ProtectedRoute({ children, pageRoute }) {
  const location = useLocation();
  const { canAccess, loading } = usePageAccess(pageRoute);

  if (loading) {
    return <div>Loading...</div>; // Or your loading component
  }

  if (!canAccess) {
    // Redirect to unauthorized page or login
    return <Navigate to="/unauthorized" state={{ from: location }} replace />;
  }

  return children;
}
```

## Login Component Example

```javascript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Login returns minimal user data (id, email, displayName)
      await login(email, password);
      
      // Full user data is automatically fetched by AuthContext after login
      // No need to store user data manually - it's in memory via context
      
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        required
      />
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={loading}>
        {loading ? 'Logging in...' : 'Login'}
      </button>
    </form>
  );
}
```

## Migration Cleanup

Add this to your app initialization to clean up old localStorage data:

```javascript
// Migration: Clear old user data from localStorage
function migrateAuthStorage() {
  // Check if old user object exists
  const oldUser = localStorage.getItem('user');
  if (oldUser) {
    // Remove old user data (should not be stored)
    localStorage.removeItem('user');
    console.log('Migrated: Removed old user data from localStorage');
  }
  
  // Token should remain - it's the only thing we store
  const token = localStorage.getItem('token');
  if (!token) {
    // No token means user needs to login again
    // This is expected after migration
  }
}

// Call on app initialization
migrateAuthStorage();
```

## Axios Interceptor Example

```javascript
import axios from 'axios';
import AuthService from './services/AuthService';

const authService = new AuthService(process.env.REACT_APP_API_URL);

// Create axios instance
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:3000/api'
});

// Request interceptor: Add token to all requests
api.interceptors.request.use(
  (config) => {
    const token = authService.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle token expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Try to refresh token before giving up
      try {
        const refreshResult = await authService.refreshToken();
        if (refreshResult) {
          // Token refreshed - retry original request
          originalRequest.headers.Authorization = `Bearer ${refreshResult.token}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed - clear token and redirect
      }

      // Clear invalid token
      authService.removeToken();

      // Redirect to login
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;
```

## Usage Examples

### Check Permission Before Showing Button

```javascript
import { usePermission } from '../hooks/usePermission';

function EventList() {
  const { hasPermission, loading } = usePermission('event', 'create');

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <h1>Events</h1>
      {hasPermission && (
        <button onClick={handleCreateEvent}>Create Event</button>
      )}
    </div>
  );
}
```

### Check Feature Access

```javascript
import { useFeature } from '../hooks/useFeature';

function Dashboard() {
  const { canUse: canExportData } = useFeature('export-data');

  return (
    <div>
      <h1>Dashboard</h1>
      {canExportData && (
        <button onClick={handleExport}>Export Data</button>
      )}
    </div>
  );
}
```

### Conditional Rendering Based on Permissions

```javascript
import { useAuth } from '../contexts/AuthContext';

function UserMenu() {
  const { checkPermission } = useAuth();
  const [canManageUsers, setCanManageUsers] = useState(false);

  useEffect(() => {
    checkPermission('user', 'read').then(setCanManageUsers);
  }, [checkPermission]);

  return (
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/events">Events</a>
      {canManageUsers && <a href="/users">Users</a>}
    </nav>
  );
}
```

## Key Security Practices

1. **Never store user data in localStorage** - Only the token
2. **Always query server for permissions** - Never use cached permission data
3. **Revalidate on app load** - Call `/api/auth/me` on mount
4. **Revalidate on focus** - Check session when user returns to tab
5. **Handle 401 responses** - Clear token and redirect to login
6. **Use hooks for permission checks** - Ensures fresh data from server
7. **Store user data in memory only** - React Context/State, cleared on refresh
