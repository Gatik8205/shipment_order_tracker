import { BrowserRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import NewShipment from './pages/NewShipment.jsx';
import ShipmentDetail from './pages/ShipmentDetail.jsx';

/** Header shown on every page; hides auth controls when on public routes. */
function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid #ddd' }}>
      <Link to="/" style={{ fontWeight: 'bold', textDecoration: 'none' }}>
        Shipment Tracker
      </Link>
      <span style={{ flex: 1 }} />
      {user ? (
        <>
          <span>Hello, {user.name}</span>
          <button type="button" onClick={handleLogout}>
            Logout
          </button>
        </>
      ) : (
        <>
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </>
      )}
    </header>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <main style={{ padding: '1.5rem' }}>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* Protected routes */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/shipments/new"
              element={
                <ProtectedRoute>
                  <NewShipment />
                </ProtectedRoute>
              }
            />
            <Route
              path="/shipments/:id"
              element={
                <ProtectedRoute>
                  <ShipmentDetail />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
