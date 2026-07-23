'use client';

import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import { DeliveryProviderAccessProvider } from '@/contexts/DeliveryProviderAccessContext';
import styles from './MainLayout.module.css';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <DeliveryProviderAccessProvider>
      <div className={styles.layout}>
        <Sidebar />
        <div className={styles.main}>
          <TopBar />
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </DeliveryProviderAccessProvider>
  );
}
