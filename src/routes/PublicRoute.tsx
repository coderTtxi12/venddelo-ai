import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, firebaseUser, isCheckingPanelAccess } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Cargando...</p>
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  if (firebaseUser && isCheckingPanelAccess) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Verificando acceso al panel…</p>
      </div>
    );
  }

  return <>{children}</>;
}
