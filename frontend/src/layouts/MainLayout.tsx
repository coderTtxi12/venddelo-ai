'use client';

import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import { RestaurantOrdersProvider } from '@/contexts/RestaurantOrdersContext';
import styles from './MainLayout.module.css';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestaurantOrdersProvider>
      <div className={styles.layout}>
        <Sidebar />
        <div className={styles.main}>
          <TopBar />
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </RestaurantOrdersProvider>
  );
}
