import { Outlet } from 'react-router-dom';
import Sidebar from '../components/ui/Sidebar';
import TopBar from '../components/ui/TopBar';
import styles from './MainLayout.module.css';

export default function MainLayout() {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <div className={styles.main}>
        <TopBar />
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
