import { type ReactNode, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';
import { useSyncStatus } from '../lib/hooks';
import { triggerCustomCardsSync } from '../lib/collectionStorage';
import { triggerHaptic } from '../lib/haptic';

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

  const handleSyncClick = () => {
    if (syncStatus === 'error' || syncStatus === 'offline-pending') {
      triggerHaptic('medium');
      triggerCustomCardsSync();
    }
  };

  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const [updateFn, setUpdateFn] = useState<(() => void) | null>(null);

  useEffect(() => {
    const handlePwaUpdate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail.update === 'function') {
        setUpdateFn(() => detail.update);
        setShowUpdateToast(true);
        triggerHaptic('success');
      }
    };

    window.addEventListener('carddex:pwa-update', handlePwaUpdate);
    return () => window.removeEventListener('carddex:pwa-update', handlePwaUpdate);
  }, []);

  return (
    <div className="shell-wrap">
      <div className="shell-frame">
        {syncStatus !== 'idle' && (
          <div
            className={`sync-pill sync-status-${syncStatus}`}
            onClick={handleSyncClick}
            style={{
              cursor:
                syncStatus === 'error' || syncStatus === 'offline-pending' ? 'pointer' : 'default',
            }}
          >
            <div className="sync-icon">
              {syncStatus === 'syncing' && (
                <svg
                  className="spinner"
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <circle cx="8" cy="8" r="6" stroke="rgba(47, 111, 224, 0.2)" />
                  <path d="M8 2a6 6 0 0 1 6 6" />
                </svg>
              )}
              {syncStatus === 'synced' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="var(--success)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.5 4.5L6.2 11.8L2.5 8.1" />
                </svg>
              )}
              {syncStatus === 'error' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="var(--error)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="8" y1="4" x2="8" y2="9" />
                  <circle cx="8" cy="12" r="1" fill="var(--error)" stroke="none" />
                </svg>
              )}
              {syncStatus === 'offline-pending' && (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#FF9500"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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

        {showUpdateToast && (
          <div className="pwa-toast">
            <div className="pwa-toast-content">
              <span className="pwa-toast-emoji">✨</span>
              <div className="pwa-toast-text">
                <div style={{ fontWeight: 700, fontSize: 13, color: '#fff' }}>¡Nueva versión disponible!</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>Actualiza CardDex para ver los últimos cambios.</div>
              </div>
            </div>
            <button
              onClick={() => {
                triggerHaptic('medium');
                if (updateFn) updateFn();
              }}
              className="pwa-toast-btn"
            >
              Actualizar
            </button>
          </div>
        )}
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
          top: calc(14px + env(safe-area-inset-top, 0px));
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
          pointer-events: auto;
          transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease;
        }
        .sync-pill:active {
          transform: translateX(-50%) scale(0.96);
          background: rgba(28, 32, 45, 0.95);
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
          padding-top: env(safe-area-inset-top, 0px);
          padding-bottom: ${hideNav ? '0px' : 'calc(80px + env(safe-area-inset-bottom, 0px))'};
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
        .pwa-toast {
          position: absolute;
          bottom: ${hideNav ? '20px' : 'calc(94px + env(safe-area-inset-bottom, 0px))'};
          left: 16px;
          right: 16px;
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 20px;
          background: rgba(18, 22, 33, 0.85);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.08);
          animation: slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .pwa-toast-content {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          min-width: 0;
        }
        .pwa-toast-emoji {
          font-size: 18px;
          flex-shrink: 0;
        }
        .pwa-toast-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .pwa-toast-btn {
          background: linear-gradient(135deg, #7b5ad9, #2f6fe0);
          color: #ffffff;
          border: none;
          font-size: 12.5px;
          font-weight: 800;
          padding: 8px 16px;
          border-radius: 12px;
          cursor: pointer;
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(123, 90, 217, 0.3);
          transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .pwa-toast-btn:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
}
