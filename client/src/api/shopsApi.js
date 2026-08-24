import apiClient from './client';

export async function searchShops(q) {
  const { data } = await apiClient.get('/shops/search', { params: { q } });
  return data.data;
}

export async function listShops(search) {
  const { data } = await apiClient.get('/shops', { params: search ? { search } : {} });
  return data.data;
}

export async function getShop(id) {
  const { data } = await apiClient.get(`/shops/${id}`);
  return data.data;
}

export async function createShop(shopName) {
  const { data } = await apiClient.post('/shops', { shop_name: shopName });
  return data.data;
}

export async function updateShop(id, shopName) {
  const { data } = await apiClient.put(`/shops/${id}`, { shop_name: shopName });
  return data.data;
}
