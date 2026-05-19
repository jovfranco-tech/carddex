import { useRef, useState } from 'react';
import Surface from '@/components/Surface';
import { Toast } from '@/components/Section';
import {
  CheckIcon,
  DownloadIcon,
  UploadIcon,
  TrashIcon,
  InfoIcon,
} from '@/components/icons';
import { useCollectionSummary } from '@/lib/hooks';
import {
  clearCollection,
  exportCollection,
  importCollection,
  resetRecentlyViewed,
} from '@/lib/collectionStorage';
import { hasApiKey, clearApiCache } from '@/lib/pokemonTcgApi';
import { formatInt } from '@/lib/formatters';
import { prefersMXN, setPrefersMXN } from '@/lib/pricing';
import { useAuth } from '@/lib/authContext';
import { supabase } from '@/lib/supabaseClient';

const APP_VERSION = '1.0.1';

/**
 * Profile / Settings — info, export/import, clear local data, disclaimer.
 */
export default function ProfileScreen() {
  const summary = useCollectionSummary();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [mxnEnabled, setMxnEnabled] = useState(prefersMXN());
  const { user } = useAuth();
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      showToast('Ingresa correo y contraseña');
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
    setAuthLoading(false);
    if (error) showToast(error.message);
    else showToast('Sesión iniciada');
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authName) {
      showToast('Completa todos los campos para registrarte');
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.signUp({ 
      email: authEmail, 
      password: authPassword,
      options: {
        data: { full_name: authName }
      }
    });
    setAuthLoading(false);
    if (error) showToast(error.message);
    else showToast('Cuenta creada y sesión iniciada');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    showToast('Sesión cerrada');
  };

  const handleUpdateName = async () => {
    if (!editNameValue.trim()) {
      setIsEditingName(false);
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: editNameValue.trim() }
    });
    setAuthLoading(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast('Nombre actualizado');
      setIsEditingName(false);
    }
  };

  const apiKeyConfigured = hasApiKey();

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const handleExport = () => {
    try {
      const json = exportCollection();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `carddex-export-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Colección exportada');
    } catch {
      showToast('Error al exportar');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const { imported } = importCollection(text);
      showToast(`Se importaron ${formatInt(imported)} cartas`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Archivo inválido';
      showToast(`Error al importar: ${msg}`);
    } finally {
      // Reset input so the same file can be re-imported if needed.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClear = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      window.setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    clearCollection();
    clearApiCache();
    setConfirmingClear(false);
    showToast('Datos locales borrados');
  };

  const handleResetRecent = () => {
    resetRecentlyViewed();
    showToast('Historial reciente vaciado');
  };

  const handleToggleMxn = () => {
    const next = !mxnEnabled;
    setPrefersMXN(next);
    setMxnEnabled(next);
    window.location.reload();
  };

  return (
    <div style={{ paddingBottom: 110 }}>
      <Toast message={toast ?? ''} visible={!!toast} onHide={() => setToast(null)} duration={2000} />

      {/* Header */}
      <div style={{ padding: '54px 18px 18px' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 26,
            fontWeight: 800,
            color: 'var(--ink)',
            letterSpacing: -0.6,
          }}
        >
          Perfil
        </h1>
      </div>

      {/* Profile card */}
      <div style={{ padding: '0 14px 14px' }}>
        <Surface style={{ padding: 20, textAlign: 'center' }}>
          {!user ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                {isLoginMode ? 'Accede a tu cuenta' : 'Crea una cuenta'}
              </div>
              <form onSubmit={isLoginMode ? handleLogin : handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {!isLoginMode && (
                  <input 
                    type="text" 
                    placeholder="Tu nombre o apodo" 
                    value={authName} 
                    onChange={(e) => setAuthName(e.target.value)} 
                    style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'var(--bg)', color: 'var(--ink)' }} 
                    required
                  />
                )}
                <input 
                  type="email" 
                  placeholder="Correo electrónico" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'var(--bg)', color: 'var(--ink)' }} 
                  required
                />
                <input 
                  type="password" 
                  placeholder="Contraseña" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--hairline)', background: 'var(--bg)', color: 'var(--ink)' }} 
                  required
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button type="submit" disabled={authLoading} style={{ flex: 1, padding: 14, borderRadius: 12, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700 }}>
                    {authLoading ? '...' : (isLoginMode ? 'Iniciar Sesión' : 'Registrarse')}
                  </button>
                  <button type="button" onClick={() => setIsLoginMode(!isLoginMode)} disabled={authLoading} style={{ flex: 1, padding: 14, borderRadius: 12, border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontWeight: 700 }}>
                    {isLoginMode ? 'Crear cuenta' : 'Ya tengo cuenta'}
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  margin: '0 auto 12px',
                  background:
                    'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                {(user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: -0.3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {isEditingName ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input 
                      autoFocus
                      value={editNameValue}
                      onChange={e => setEditNameValue(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--bg)', color: 'var(--ink)', fontSize: 16 }}
                    />
                    <button onClick={handleUpdateName} disabled={authLoading} style={{ padding: '6px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700 }}>
                      ✓
                    </button>
                  </div>
                ) : (
                  <>
                    <span>{user.user_metadata?.full_name || user.email}</span>
                    <button 
                      onClick={() => {
                        setEditNameValue(user.user_metadata?.full_name || '');
                        setIsEditingName(true);
                      }}
                      style={{ background: 'transparent', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}
                    >
                      Editar
                    </button>
                  </>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {formatInt(summary.uniqueCount)} únicas ·{' '}
                {formatInt(summary.totalQuantity)} cartas
              </div>
              <button 
                onClick={handleLogout}
                style={{ marginTop: 12, background: 'transparent', border: 'none', color: 'var(--error)', fontWeight: 600, cursor: 'pointer' }}
              >
                Cerrar sesión
              </button>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: '0.5px solid var(--hairline)',
                }}
              >
                <Stat n={formatInt(summary.favoriteCount)} l="Favoritas" />
                <Stat n={formatInt(summary.wishlistCount)} l="Wishlist" />
                <Stat n={formatInt(summary.missingCount)} l="Faltan" />
              </div>
            </>
          )}
        </Surface>
      </div>

      {/* API key status */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Conexión con la API</SectionTitle>
        <Surface style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: apiKeyConfigured
                  ? 'rgba(52,199,89,0.15)'
                  : 'rgba(242,153,74,0.15)',
                color: apiKeyConfigured ? 'var(--success)' : 'var(--warning)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {apiKeyConfigured ? <CheckIcon size={18} /> : <InfoIcon size={18} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: -0.2,
                }}
              >
                {apiKeyConfigured ? 'API configurada' : 'Usando acceso público'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {apiKeyConfigured
                  ? 'Base URL: pokemontcg.io'
                  : 'Base URL: pokemontcg.io'}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      {/* Preferences */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Preferencias</SectionTitle>
        <Surface style={{ padding: 0, overflow: 'hidden' }}>
          <ActionRow
            icon={<span style={{ fontWeight: 800, fontSize: 16 }}>$</span>}
            label="Mostrar en Pesos (MXN)"
            description={`Convierte valores estimados a MXN (${mxnEnabled ? 'Activado' : 'Desactivado'})`}
            onClick={handleToggleMxn}
          />
        </Surface>
      </div>

      {/* Data management */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Datos locales</SectionTitle>
        <Surface style={{ padding: 0, overflow: 'hidden' }}>
          <ActionRow
            icon={<DownloadIcon size={18} />}
            label="Exportar colección"
            description="Descarga un archivo JSON con tu colección"
            onClick={handleExport}
          />
          <Divider />
          <ActionRow
            icon={<UploadIcon size={18} />}
            label="Importar colección"
            description="Carga un archivo JSON previamente exportado"
            onClick={handleImportClick}
          />
          <Divider />
          <ActionRow
            icon={<InfoIcon size={18} />}
            label="Reiniciar historial reciente"
            description="Vacía la lista de cartas vistas recientemente"
            onClick={handleResetRecent}
          />
          <Divider />
          <ActionRow
            icon={<TrashIcon size={18} />}
            label={confirmingClear ? 'Toca de nuevo para confirmar' : 'Borrar datos locales'}
            description={
              confirmingClear
                ? 'Esta acción no se puede deshacer'
                : 'Elimina tu colección y configuración'
            }
            destructive
            onClick={handleClear}
          />
        </Surface>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
      </div>

      {/* Scanner status */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Escáner</SectionTitle>
        <Surface style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: 'rgba(52,199,89,0.15)',
                color: 'var(--success)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <InfoIcon size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: -0.2,
                }}
              >
                Detección activa (OpenAI Vision)
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                Analizando el nombre y el número de la carta con IA
              </div>
            </div>
          </div>
        </Surface>
      </div>

      {/* Assistant status */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Asistente IA</SectionTitle>
        <Surface style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: 'var(--accent-tint)',
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 17,
                fontWeight: 800,
              }}
            >
              ✦
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: -0.2,
                }}
              >
                Asistente local/reglas MVP
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                LLM real pendiente para v2 vía endpoint seguro
              </div>
            </div>
          </div>
        </Surface>
      </div>

      {/* About */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Acerca de</SectionTitle>
        <Surface style={{ padding: 16 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: -0.2,
              marginBottom: 4,
            }}
          >
            CardDex
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            Versión {APP_VERSION}
          </div>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 12,
              lineHeight: 1.55,
              color: 'var(--muted)',
            }}
          >
            Proyecto personal sin fines comerciales para llevar el control de tu
            colección de cartas Pokémon TCG. CardDex no está afiliado, asociado,
            autorizado, respaldado por, ni vinculado oficialmente con Nintendo,
            The Pokémon Company, Creatures Inc. ni Game Freak. Todas las marcas
            y derechos pertenecen a sus respectivos propietarios. Los datos de
            cartas y precios provienen de{' '}
            <a
              href="https://pokemontcg.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent)', fontWeight: 600 }}
            >
              pokemontcg.io
            </a>
            .
          </p>
        </Surface>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'var(--muted)',
        letterSpacing: 0.4,
        fontWeight: 700,
        textTransform: 'uppercase',
        padding: '0 4px 8px',
      }}
    >
      {children}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  description,
  onClick,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        cursor: 'pointer',
        fontFamily: 'inherit',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          background: destructive
            ? 'rgba(255,59,48,0.10)'
            : 'var(--accent-tint)',
          color: destructive ? 'var(--error)' : 'var(--accent)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: destructive ? 'var(--error)' : 'var(--ink)',
            letterSpacing: -0.2,
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 0.5,
        background: 'var(--hairline)',
        marginLeft: 66,
      }}
    />
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: 'var(--ink)',
          letterSpacing: -0.3,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{l}</div>
    </div>
  );
}
