import apiClient from './client';

export async function getInventory() {
  const { data } = await apiClient.get('/inventory');
  return data.data;
}

export async function adjustInventory(bundleType, delta) {
  const { data } = await apiClient.post('/inventory/adjust', { bundle_type: bundleType, delta });
  return data.data;
}
