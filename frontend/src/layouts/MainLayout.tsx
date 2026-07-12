'use client';

import AssistantChatPanel from '@/components/assistant/AssistantChatPanel';
import Sidebar from '@/components/ui/Sidebar';
import TopBar from '@/components/ui/TopBar';
import { AssistantChatProvider } from '@/contexts/AssistantChatContext';
import { RestaurantAccessProvider } from '@/contexts/RestaurantAccessContext';
import { RestaurantOrdersProvider } from '@/contexts/RestaurantOrdersContext';
import styles from './MainLayout.module.css';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <RestaurantAccessProvider>
      <RestaurantOrdersProvider>
        <AssistantChatProvider>
          <div className={styles.layout}>
            <Sidebar />
            <AssistantChatPanel />
            <div className={styles.main}>
              <TopBar />
              <div className={styles.content}>{children}</div>
            </div>
          </div>
        </AssistantChatProvider>
      </RestaurantOrdersProvider>
    </RestaurantAccessProvider>
  );
}
