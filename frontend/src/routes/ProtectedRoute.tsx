import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, firebaseUser, isCheckingPanelAccess } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Cargando...</p>
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;

  if (isCheckingPanelAccess) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Verificando acceso al panel…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
