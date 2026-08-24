import apiClient from './client';

export async function getDashboard() {
  const { data } = await apiClient.get('/analytics/dashboard');
  return data.data;
}

// params: { range, from, to, limit }
export async function getSummary(params) {
  const { data } = await apiClient.get('/analytics/summary', { params });
  return data.data;
}
