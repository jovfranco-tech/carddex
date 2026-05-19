import { type ComponentType } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  ScanIcon,
  LayersIcon,
  BookIcon,
  UserIcon,
  type IconProps,
} from './icons';

interface Tab {
  key: string;
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
}

const TABS: Tab[] = [
  { key: 'home', label: 'Inicio', path: '/', icon: HomeIcon },
  { key: 'scan', label: 'Escanear', path: '/scan', icon: ScanIcon },
  { key: 'library', label: 'Colección', path: '/library', icon: LayersIcon },
  { key: 'sets', label: 'Expansiones', path: '/sets', icon: BookIcon },
  { key: 'profile', label: 'Perfil', path: '/profile', icon: UserIcon },
];

export default function BottomNavigation() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/') return pathname === '/';
    return pathname === path || pathname.startsWith(`${path}/`);
  };

  return (
    <nav
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        padding: '8px 8px 26px',
        background: 'rgba(247, 248, 251, 0.92)',
        backdropFilter: 'blur(18px) saturate(180%)',
        WebkitBackdropFilter: 'blur(18px) saturate(180%)',
        borderTop: '0.5px solid var(--hairline)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'flex-end',
      }}
      aria-label="Navegación principal"
      className="bottom-nav-fixed"
    >
      {TABS.map((t) => {
        const active = isActive(t.path);
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            onClick={() => navigate(t.path)}
            aria-label={t.label}
            aria-current={active ? 'page' : undefined}
            style={{
              background: 'transparent',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              color: active ? 'var(--accent)' : 'var(--muted-2)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: '4px 6px',
              transition: 'color 160ms',
              minWidth: 56,
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.1 : 1.8} />
            <span
              style={{
                fontSize: 10.5,
                fontWeight: active ? 700 : 500,
                letterSpacing: -0.1,
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

// Export NavLink wrapper used elsewhere if needed
export { NavLink };
