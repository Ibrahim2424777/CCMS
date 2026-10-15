import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/transactions', label: 'Transactions' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/analytics', label: 'Analytics' },
];

function navLinkClass({ isActive }) {
  return `nav-link${isActive ? ' active' : ''}`;
}

export function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the mobile menu automatically on navigation, so it doesn't stay
  // open after the user taps a link.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="d-flex flex-column min-vh-100 app-bg">
      <nav className="app-navbar navbar navbar-dark px-3 px-md-4 py-2">
        <div className="d-flex w-100 align-items-center flex-wrap">
          <NavLink to="/" className="brand-lockup navbar-brand mb-0 me-auto me-lg-4">
            <span className="brand-mark">CCMS</span>
            <span className="brand-name">Cash Change Management</span>
          </NavLink>

          <button
            type="button"
            className="app-navbar-toggler d-lg-none"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div
            className={`app-navbar-links d-lg-flex align-items-lg-center gap-lg-2 flex-grow-1${menuOpen ? ' show' : ''}`}
          >
            {NAV_LINKS.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.end} className={navLinkClass}>
                {link.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink to="/users" className={navLinkClass}>
                Users
              </NavLink>
            )}

            <div className="app-navbar-user d-none d-lg-flex ms-lg-auto align-items-center gap-2 gap-lg-3">
              <span className="text-white-50 small">
                {user?.name} <span className="badge bg-secondary ms-1">{user?.role}</span>
              </span>
              <button type="button" className="btn btn-outline-light btn-sm" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="flex-grow-1 p-3 p-md-4">
        {/* Keyed by path so each navigation remounts the stage and replays
            the staggered page-load reveal (index.css, "Motion"). */}
        <div className="page-stage" key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
