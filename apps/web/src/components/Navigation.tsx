import { NavLink } from 'react-router-dom';
import styles from './Navigation.module.css';

function Navigation() {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: '🏠' },
    { path: '/devices', label: 'Devices', icon: '📱' },
    { path: '/sessions', label: 'Sessions', icon: '🔗' },
    { path: '/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <nav className={styles.nav}>
      <ul className={styles.list}>
        {navItems.map((item) => (
          <li key={item.path} className={styles.item}>
            <NavLink
              to={item.path}
              className={({ isActive }) =>
                isActive ? `${styles.link} ${styles.active}` : styles.link
              }
            >
              <span className={styles.icon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default Navigation;
