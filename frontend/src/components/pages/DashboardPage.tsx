'use client';

import { useRouter } from 'next/navigation';
import styles from './DashboardPage.module.css';
import QuickActionCard from '@/components/ui/QuickActionCard';
import quickActionCardStyles from '@/components/ui/QuickActionCard.module.css';

type DashboardQuickAction = {
  title: string;
  desc: string;
  to?: string;
};

const quickActions: DashboardQuickAction[] = [
  {
    title: 'Productos',
    desc: 'Administra tus productos, categorías y promociones',
    to: '/products',
  },
  {
    title: 'Menú Digital',
    desc: 'Previsualiza, comparte y publica tu menú para tus clientes',
    to: '/digital-menu',
  },
  {
    title: 'Analíticas',
    desc: 'Consulta métricas de ventas, clientes y rendimiento',
    to: '/analytics',
  },
];

export default function DashboardPage() {
  const router = useRouter();

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            ¡Bienvenido! Aquí tienes lo que pasa hoy en tu restaurante.
          </p>
        </div>
      </div>

      <div className={quickActionCardStyles.cardsRow}>
        {quickActions.map((a) => (
          <QuickActionCard
            key={a.title}
            title={a.title}
            description={a.desc}
            onClick={() => {
              if (a.to) router.push(a.to);
            }}
          />
        ))}
      </div>
    </div>
  );
}
