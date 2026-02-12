import type { ReactNode } from 'react';
import styles from './Layout.module.css';
import ConnectionStatus from './ConnectionStatus';
import Navigation from './Navigation';

interface LayoutProps {
  children: ReactNode;
}

function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="32" height="32" rx="8" fill="#2563eb"/>
            <path d="M8 16L14 22L24 10" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className={styles.logoText}>SyncBridge</span>
        </div>
        <ConnectionStatus />
      </header>
      
      <div className={styles.container}>
        <aside className={styles.sidebar}>
          <Navigation />
        </aside>
        
        <main className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
