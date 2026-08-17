'use client';

import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import ZoneSwitcher from '@/components/zones/ZoneSwitcher';
import { MobileSidebarProvider } from '@/contexts/MobileSidebarContext';
import styles from './MainLayout.module.css';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileSidebarProvider>
      <div className={styles.layout}>
        <Sidebar />
        <div className={styles.main}>
          <TopBar />
          <ZoneSwitcher />
          <div className={styles.content} data-scroll-lock>
            {children}
          </div>
        </div>
      </div>
    </MobileSidebarProvider>
  );
}
