import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// AuthContext registers a callback here so that a 401 discovered on ANY
// later request (e.g. a session that expired mid-use) clears the client-side
// user state and lets ProtectedRoute redirect to /login naturally. Deliberately
// NOT applied to /auth/login or /auth/me - those endpoints' own callers
// (the login form, AuthContext's boot check) need to handle a 401 themselves
// rather than being redirected out from under them.
let onUnauthorized = null;
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const isAuthBootstrapCall = url.includes('/auth/login') || url.includes('/auth/me');

    if (status === 401 && !isAuthBootstrapCall && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default apiClient;
