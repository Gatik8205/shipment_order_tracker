import client from './client.js';

/** Register a new user. Returns { token, user }. */
export function register(data) {
  return client.post('/auth/register', data).then((r) => r.data);
}

/** Login with email + password. Returns { token, user }. */
export function login(data) {
  return client.post('/auth/login', data).then((r) => r.data);
}

/** Fetch the currently authenticated user. Returns { id, name, email, role }. */
export function me() {
  return client.get('/auth/me').then((r) => r.data);
}
