import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from '@/components/AppShell';
import HomeScreen from '@/screens/HomeScreen';
import ScanScreen from '@/screens/ScanScreen';
import DetailScreen from '@/screens/DetailScreen';
import LibraryScreen from '@/screens/LibraryScreen';
import SetsScreen from '@/screens/SetsScreen';
import ProfileScreen from '@/screens/ProfileScreen';
import DecksScreen from '@/screens/DecksScreen';
import DeckDetailScreen from '@/screens/DeckDetailScreen';
import PublicProfileScreen from '@/screens/PublicProfileScreen';
import { ROUTES } from './routes';
import { AuthProvider } from '@/lib/authContext';

/**
 * Top-level error boundary. Catches render errors so the whole app doesn't go
 * white-screen if a single route throws.
 */
class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('App error:', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            background: 'var(--bg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: 18,
              padding: 24,
              maxWidth: 360,
              boxShadow: 'var(--shadow-1)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 32,
                marginBottom: 12,
              }}
            >
              ⚠︎
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--ink)',
                letterSpacing: -0.4,
              }}
            >
              La aplicación se detuvo inesperadamente
            </h2>
            <p
              style={{
                margin: '8px 0 16px',
                fontSize: 13,
                color: 'var(--muted)',
                lineHeight: 1.5,
              }}
            >
              {this.state.error?.message ?? 'Error desconocido.'}
            </p>
            <button
              onClick={this.reset}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 12,
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Reintentar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path={ROUTES.home} element={<HomeScreen />} />
              <Route path={ROUTES.scan} element={<ScanScreen />} />
              <Route path={ROUTES.cardDetailPattern} element={<DetailScreen />} />
              <Route path={ROUTES.library} element={<LibraryScreen />} />
              <Route path={ROUTES.sets} element={<SetsScreen />} />
              <Route path={ROUTES.profile} element={<ProfileScreen />} />
              <Route path={ROUTES.decks} element={<DecksScreen />} />
              <Route path={ROUTES.deckDetailPattern} element={<DeckDetailScreen />} />
              <Route path={ROUTES.publicProfilePattern} element={<PublicProfileScreen />} />
              <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </AuthProvider>
    </RootErrorBoundary>
  );
}
