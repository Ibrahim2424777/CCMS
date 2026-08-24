import { useEffect, useState } from 'react';
import * as usersApi from '../../api/usersApi';
import { useAuth } from '../../context/AuthContext';

const EMPTY_FORM = { name: '', email: '', password: '', role: 'STAFF' };

export default function Users() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setListError('');
    try {
      setUsers(await usersApi.listUsers());
    } catch {
      setListError('Could not load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreate = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await usersApi.createUser(form);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      setFormError(err.response?.data?.error?.message || 'Could not create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (targetUser) => {
    setListError('');
    try {
      await usersApi.updateUser(targetUser.id, { is_active: !targetUser.is_active });
      await loadUsers();
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Could not update user.');
    }
  };

  const changeRole = async (targetUser, role) => {
    if (role === targetUser.role) return;
    setListError('');
    try {
      await usersApi.updateUser(targetUser.id, { role });
      await loadUsers();
    } catch (err) {
      setListError(err.response?.data?.error?.message || 'Could not update user.');
    }
  };

  return (
    <div>
      <h1 className="h4 mb-4">User Management</h1>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <h2 className="h6 mb-3">Add User</h2>
          {formError && (
            <div className="alert alert-danger py-2" role="alert">
              {formError}
            </div>
          )}
          <form onSubmit={handleCreate} className="row g-2 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label small">Name</label>
              <input
                className="form-control"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small">Email</label>
              <input
                type="email"
                className="form-control"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <label className="form-label small">Password</label>
              <input
                type="password"
                className="form-control"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small">Role</label>
              <select
                className="form-select"
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <div className="col-6 col-md-1">
              <button type="submit" className="btn btn-primary w-100" disabled={submitting}>
                {submitting ? '...' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body p-0">
          {listError && (
            <div className="alert alert-danger m-3 mb-0" role="alert">
              {listError}
            </div>
          )}
          {loading ? (
            <div className="p-4 text-center text-muted">
              <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="p-4 text-center text-muted">No users yet.</div>
          ) : (
            <div className="table-responsive">
              <table className="table mb-0 align-middle">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.name}</td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          style={{ width: 'auto' }}
                          value={u.role}
                          disabled={u.id === currentUser.id}
                          onChange={(e) => changeRole(u, e.target.value)}
                        >
                          <option value="STAFF">Staff</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? 'bg-success' : 'bg-secondary'}`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          disabled={u.id === currentUser.id}
                          title={u.id === currentUser.id ? 'You cannot change your own account here' : ''}
                          onClick={() => toggleActive(u)}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
