import apiClient from './client';

export async function login(email, password) {
  const { data } = await apiClient.post('/auth/login', { email, password });
  return data.data;
}

export async function logout() {
  await apiClient.post('/auth/logout');
}

export async function fetchCurrentUser() {
  const { data } = await apiClient.get('/auth/me');
  return data.data;
}
