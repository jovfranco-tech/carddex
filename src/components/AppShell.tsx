import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import { useSyncStatus } from '../lib/hooks';

export interface AppShellProps {
  children: ReactNode;
}

/**
 * Renders the mobile-shaped container that hosts every route, with a translucent
 * bottom navigation bar overlaid at the foot. On wider viewports we draw a soft
 * outer frame so the experience feels phone-like; on actual phones we drop the
 * frame and use the full viewport.
 */
export default function AppShell({ children }: AppShellProps) {
  const { pathname } = useLocation();
  const syncStatus = useSyncStatus();
  const hideNav =
    pathname === '/scan' ||
    pathname.startsWith('/card/') ||
    pathname.startsWith('/scan/') ||
    pathname.startsWith('/deck/') ||
    pathname.startsWith('/u/');

  return (
    <div className="shell-wrap">
      <div className="shell-frame">
        {syncStatus !== 'idle' && (
          <div className={`sync-pill sync-status-${syncStatus}`}>
            <div className="sync-icon">
              {syncStatus === 'syncing' && (
                <svg className="spinner" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6" stroke="rgba(47, 111, 224, 0.2)" />
                  <path d="M8 2a6 6 0 0 1 6 6" />
                </svg>
              )}
              {syncStatus === 'synced' && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13.5 4.5L6.2 11.8L2.5 8.1" />
                </svg>
              )}
              {syncStatus === 'error' && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--error)" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="8" y1="4" x2="8" y2="9" />
                  <circle cx="8" cy="12" r="1" fill="var(--error)" stroke="none" />
                </svg>
              )}
              {syncStatus === 'offline-pending' && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#FF9500" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="6" />
                  <path d="M8 5v3h3" />
                </svg>
              )}
            </div>
            <span className="sync-text">
              {syncStatus === 'syncing' && 'Sincronizando...'}
              {syncStatus === 'synced' && 'Sincronizado'}
              {syncStatus === 'error' && 'Error de red'}
              {syncStatus === 'offline-pending' && 'Pendiente (Offline)'}
            </span>
            <span className="sync-dot" />
          </div>
        )}
        <div className="shell-screen">
          <div key={pathname} className="page-transition">
            {children}
          </div>
        </div>
        {!hideNav && <BottomNavigation />}
      </div>
      <style>{`
        .shell-wrap {
          display: flex;
          justify-content: center;
        }
        .shell-frame {
          width: 100%;
          max-width: var(--shell-max, 100%);
          height: 100vh;
          height: 100dvh;
          background: var(--bg);
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .sync-pill {
          position: absolute;
          top: 14px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 99px;
          background: rgba(18, 22, 33, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08);
          animation: toastIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          pointer-events: none;
        }
        .sync-text {
          font-size: 11.5px;
          font-weight: 600;
          letter-spacing: -0.1px;
          color: #ffffff;
        }
        .sync-icon {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .spinner {
          animation: spin 0.8s linear infinite;
        }
        .sync-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .sync-status-syncing .sync-dot {
          background-color: var(--accent);
          box-shadow: 0 0 8px var(--accent);
          animation: pulseDot 1.2s infinite ease-in-out;
        }
        .sync-status-synced .sync-dot {
          background-color: var(--success);
          box-shadow: 0 0 8px var(--success);
        }
        .sync-status-error .sync-dot {
          background-color: var(--error);
          box-shadow: 0 0 8px var(--error);
          animation: pulseDot 0.8s infinite ease-in-out;
        }
        .sync-status-offline-pending .sync-dot {
          background-color: #FF9500;
          box-shadow: 0 0 8px #FF9500;
          animation: pulseDot 1.5s infinite ease-in-out;
        }
        .shell-screen {
          position: relative;
          width: 100%;
          flex: 1;
          background: var(--bg);
          overflow-x: hidden;
          overflow-y: auto;
          padding-bottom: ${hideNav ? '0' : '80px'};
        }
        @media (min-width: 481px) {
          .shell-wrap {
            padding: 28px 18px 36px;
            min-height: 100vh;
          }
          .shell-frame {
            max-width: 402px;
            height: calc(100vh - 64px);
            min-height: min(874px, calc(100vh - 64px));
            border-radius: 44px;
            box-shadow:
              0 0 0 1px rgba(255, 255, 255, 0.04),
              0 2px 0 1px rgba(255, 255, 255, 0.05) inset,
              0 24px 60px rgba(0, 0, 0, 0.45);
            border: 8px solid #1c1f27;
          }
        }
      `}</style>
    </div>
  );
}
