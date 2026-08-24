import { useEffect, useRef, useState } from 'react';
import * as shopsApi from '../../api/shopsApi';

const DEBOUNCE_MS = 250;

// value: { id, shop_name } | null. Search-as-you-type against the shops
// autocomplete endpoint, with an inline "create new shop" affordance when
// nothing matches (MASTER CONTEXT section 8).
export function ShopAutocomplete({ value, onChange }) {
  const [query, setQuery] = useState(value?.shop_name || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (value) return undefined;
    if (!query.trim()) {
      setResults([]);
      return undefined;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        setResults(await shopsApi.searchShops(query.trim()));
      } catch {
        setResults([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query, value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (shop) => {
    onChange(shop);
    setQuery(shop.shop_name);
    setOpen(false);
  };

  const handleCreate = async () => {
    setError('');
    setCreating(true);
    try {
      const shop = await shopsApi.createShop(query.trim());
      handleSelect(shop);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not create shop.');
    } finally {
      setCreating(false);
    }
  };

  const trimmedQuery = query.trim();
  const exactMatch = results.some((s) => s.shop_name.toLowerCase() === trimmedQuery.toLowerCase());
  const showDropdown = open && trimmedQuery && !value;

  return (
    <div className="position-relative" ref={containerRef}>
      <label className="form-label">Shop</label>
      <input
        className="form-control"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Start typing a shop name..."
        autoComplete="off"
        required
      />
      {error && <div className="text-danger small mt-1">{error}</div>}
      {showDropdown && (
        <div
          className="list-group position-absolute w-100 shadow-sm"
          style={{ zIndex: 1000, maxHeight: '55vh', overflowY: 'auto' }}
        >
          {results.map((shop) => (
            <button
              type="button"
              key={shop.id}
              className="list-group-item list-group-item-action"
              onClick={() => handleSelect(shop)}
            >
              {shop.shop_name}
            </button>
          ))}
          {!exactMatch && (
            <button
              type="button"
              className="list-group-item list-group-item-action text-primary"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : `+ Create new shop: "${trimmedQuery}"`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
