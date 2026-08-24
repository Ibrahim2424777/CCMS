import apiClient from './client';

export async function createTransaction(payload) {
  const { data } = await apiClient.post('/transactions', payload);
  return data.data;
}

export async function updateTransaction(id, payload) {
  const { data } = await apiClient.put(`/transactions/${id}`, payload);
  return data.data;
}

export async function deleteTransaction(id) {
  await apiClient.delete(`/transactions/${id}`);
}

// params: { search, shop_id, date_from, date_to, sort, page, pageSize }
export async function listTransactions(params = {}) {
  const { data } = await apiClient.get('/transactions', { params });
  return data; // { data: [...], pagination: {...} }
}

export async function getTransaction(id) {
  const { data } = await apiClient.get(`/transactions/${id}`);
  return data.data;
}
