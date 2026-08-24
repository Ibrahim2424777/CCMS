import apiClient from './client';

export async function listUsers() {
  const { data } = await apiClient.get('/users');
  return data.data;
}

export async function createUser(payload) {
  const { data } = await apiClient.post('/users', payload);
  return data.data;
}

export async function updateUser(id, payload) {
  const { data } = await apiClient.put(`/users/${id}`, payload);
  return data.data;
}
