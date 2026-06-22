'use client';

import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { useAuth } from '@/hooks/useAuth';
import styles from './PendingReviewPage.module.css';

type PendingReviewPageProps = {
  status: 'pending_review' | 'rejected';
};

export function PendingReviewPage({ status }: PendingReviewPageProps) {
  const { logout } = useAuth();
  const rejected = status === 'rejected';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <HourglassEmptyOutlinedIcon className={styles.icon} aria-hidden />
        <h1 className={styles.title}>
          {rejected ? 'Registro no aprobado' : 'Estamos validando tu información'}
        </h1>
        <p className={styles.message}>
          {rejected
            ? 'Tu solicitud no fue aprobada. Si crees que es un error, contacta al equipo de soporte.'
            : 'Recibimos tu registro. Nuestro equipo revisará los datos de tu empresa de delivery. Te daremos acceso al panel cuando la validación esté completa.'}
        </p>
        <span
          className={`${styles.status} ${rejected ? styles.statusRejected : ''}`.trim()}
          role="status"
        >
          {rejected ? 'Solicitud rechazada' : 'En revisión'}
        </span>
        <p className={styles.message} style={{ marginTop: '1.5rem', marginBottom: 0 }}>
          <button
            type="button"
            onClick={() => void logout()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-primary)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cerrar sesión
          </button>
        </p>
      </div>
    </div>
  );
}
