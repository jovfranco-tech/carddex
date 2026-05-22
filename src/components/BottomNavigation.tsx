import { type ComponentType, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useViewTransitionNavigate } from '@/lib/hooks';
import {
  HomeIcon,
  ScanIcon,
  LayersIcon,
  DecksIcon,
  UserIcon,
  TrophyIcon,
  type IconProps,
} from './icons';
import { getUnlockedAchievements, ACHIEVEMENT_CATALOGUE } from '@/lib/achievements';

interface Tab {
  key: string;
  label: string;
  path: string;
  icon: ComponentType<IconProps>;
}

const TABS: Tab[] = [
  { key: 'home',         label: 'Inicio',     path: '/',             icon: HomeIcon },
  { key: 'scan',         label: 'Escanear',   path: '/scan',         icon: ScanIcon },
  { key: 'library',      label: 'Colección',  path: '/library',      icon: LayersIcon },
  { key: 'decks',        label: 'Mazos',      path: '/decks',        icon: DecksIcon },
  { key: 'achievements', label: 'Logros',     path: '/achievements', icon: TrophyIcon },
  { key: 'profile',      label: 'Perfil',     path: '/profile',      icon: UserIcon },
];

const SEEN_KEY = 'carddex.achievements.lastSeenCount';

export default function BottomNavigation() {
  const { pathname } = useLocation();
  const navigate = useViewTransitionNavigate();
  const [badgeCount, setBadgeCount] = useState(0);

  useEffect(() => {
    const unlockedCount = Object.keys(getUnlockedAchievements()).length;
    const lastSeen = parseInt(localStorage.getItem(SEEN_KEY) ?? '0', 10);
    setBadgeCount(Math.max(0, unlockedCount - lastSeen));

    // Listen for new achievement unlocks
    const handleAchievement = () => {
      const count = Object.keys(getUnlockedAchievements()).length;
      const seen = parseInt(localStorage.getItem(SEEN_KEY) ?? '0', 10);
      setBadgeCount(Math.max(0, count - seen));
    };
    window.addEventListener('carddex:achievement', handleAchievement);
    return () => window.removeEventListener('carddex:achievement', handleAchievement);
  }, []);

  // Clear badge when user visits achievements screen
  useEffect(() => {
    if (pathname === '/achievements') {
      const count = Object.keys(getUnlockedAchievements()).length;
      localStorage.setItem(SEEN_KEY, String(count));
      setBadgeCount(0);
    }
  }, [pathname]);

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
        const showBadge = t.key === 'achievements' && badgeCount > 0;
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
              minWidth: 50,
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Icon size={22} strokeWidth={active ? 2.1 : 1.8} />
              {showBadge && (
                <div
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -6,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #7B5AD9, #2F6FE0)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 4px rgba(123,90,217,0.5)',
                    animation: 'pulseBadge 1.5s ease-in-out infinite',
                  }}
                >
                  {badgeCount}
                </div>
              )}
            </div>
            <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, letterSpacing: -0.1 }}>
              {t.label}
            </span>
          </button>
        );
      })}

      <style>{`
        @keyframes pulseBadge {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>
    </nav>
  );
}

// Export NavLink wrapper used elsewhere if needed
export { NavLink };
