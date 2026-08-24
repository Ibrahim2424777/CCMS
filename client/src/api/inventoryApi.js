import apiClient from './client';

export async function getInventory() {
  const { data } = await apiClient.get('/inventory');
  return data.data;
}
