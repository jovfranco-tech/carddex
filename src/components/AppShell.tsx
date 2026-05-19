import { type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import BottomNavigation from './BottomNavigation';

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
  const hideNav =
    pathname === '/scan' ||
    pathname.startsWith('/card/') ||
    pathname.startsWith('/scan/') ||
    pathname.startsWith('/deck/');

  return (
    <div className="shell-wrap">
      <div className="shell-frame">
        <div className="shell-screen">
          {children}
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
