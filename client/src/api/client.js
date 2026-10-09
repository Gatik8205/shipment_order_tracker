import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL;

const client = axios.create({
  baseURL: `${BASE_URL}/api`,
});

// Attach the JWT token to every request except auth endpoints.
client.interceptors.request.use((config) => {
  const isAuthRoute =
    config.url?.includes('/auth/login') ||
    config.url?.includes('/auth/register');

  if (!isAuthRoute) {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// On 401 from any route other than /auth/login, clear storage and redirect.
client.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/** Extract a human-readable message from an axios error. */
export function getErrorMessage(err) {
  return err.response?.data?.message ?? 'An unexpected error occurred.';
}

export default client;
