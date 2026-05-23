import { useEffect, useState } from 'react';
import Surface from './Surface';
import { triggerHaptic } from '@/lib/haptic';
import { trackEvent } from '@/lib/telemetry';

interface PasskeyManagerProps {
  userEmail?: string;
  userName?: string;
  onToast: (msg: string) => void;
}

const PASSKEY_STORAGE_KEY = 'carddex.auth.passkey';
const LEGACY_CREDENTIAL_STORAGE_KEY = 'carddex.auth.passkey_cred';
const LEGACY_AES_KEY_STORAGE = 'carddex.crypto.aes_key.v2';

/**
 * Local passkey demo.
 *
 * This intentionally stores only a WebAuthn credential id or a local demo
 * marker. It never stores the user's password, even encrypted, because this
 * app does not have a server-side passkey challenge/verification flow yet.
 */
export default function PasskeyManager({ userEmail, userName, onToast }: PasskeyManagerProps) {
  const [hasPasskey, setHasPasskey] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [showBiometricScan, setShowBiometricScan] = useState(false);

  useEffect(() => {
    try {
      setHasPasskey(Boolean(localStorage.getItem(PASSKEY_STORAGE_KEY)));
      localStorage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY);
      localStorage.removeItem(LEGACY_AES_KEY_STORAGE);
    } catch {
      setHasPasskey(false);
    }
  }, []);

  const handleStartRegistration = () => {
    if (!userEmail) {
      onToast('Debes iniciar sesión con un correo para activar Passkey local');
      return;
    }
    handleRegisterPasskey();
  };

  const handleRegisterPasskey = async () => {
    if (registering) return;
    setRegistering(true);
    triggerHaptic('light');
    trackEvent('passkey_registration_started', { mode: 'local-demo' });

    if (window.isSecureContext && navigator.credentials?.create) {
      try {
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const userIdBytes = new Uint8Array(16);
        window.crypto.getRandomValues(userIdBytes);

        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'CardDex' },
            user: {
              id: userIdBytes,
              name: userEmail || 'user@carddex.local',
              displayName: userName || 'Usuario CardDex',
            },
            pubKeyCredParams: [
              { alg: -7, type: 'public-key' },
              { alg: -257, type: 'public-key' },
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              userVerification: 'required',
            },
            timeout: 15000,
          },
        });

        if (credential) {
          localStorage.setItem(PASSKEY_STORAGE_KEY, credential.id);
          localStorage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY);
          localStorage.removeItem(LEGACY_AES_KEY_STORAGE);
          setHasPasskey(true);
          onToast('Passkey local registrada. No se guardó tu contraseña.');
          triggerHaptic('success');
          trackEvent('passkey_registered_local', { mode: 'webauthn-local' });
        }
      } catch (err) {
        console.warn('WebAuthn local registration failed, showing demo passkey flow:', err);
        setShowBiometricScan(true);
      } finally {
        setRegistering(false);
      }
    } else {
      setShowBiometricScan(true);
      setRegistering(false);
    }
  };

  const handleSimulatedSuccess = () => {
    setShowBiometricScan(false);
    localStorage.setItem(PASSKEY_STORAGE_KEY, `local-demo-key-${Date.now()}`);
    localStorage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AES_KEY_STORAGE);
    setHasPasskey(true);
    onToast('Passkey local demo enlazada. Inicia sesión manualmente cuando lo necesites.');
    triggerHaptic('success');
    trackEvent('passkey_registered_demo', { mode: 'simulated-local' });
  };

  const handleSimulatedCancel = () => {
    setShowBiometricScan(false);
    onToast('Registro de passkey cancelado');
    triggerHaptic('warning');
  };

  const handleRemovePasskey = () => {
    localStorage.removeItem(PASSKEY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CREDENTIAL_STORAGE_KEY);
    localStorage.removeItem(LEGACY_AES_KEY_STORAGE);
    setHasPasskey(false);
    onToast('Passkey local removida');
    triggerHaptic('medium');
    trackEvent('passkey_removed', { mode: 'local-demo' });
  };

  return (
    <div style={{ marginTop: 14 }}>
      <Surface style={{ padding: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              Passkey local
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)', lineHeight: 1.4 }}>
              {hasPasskey
                ? 'Configurada en este dispositivo. No guarda passwords ni inicia sesión automáticamente.'
                : 'Demo WebAuthn local: prepara el flujo para una integración futura con servidor.'}
            </p>
          </div>
          <div>
            {hasPasskey ? (
              <button
                type="button"
                onClick={handleRemovePasskey}
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--error)',
                  border: 'none',
                  padding: '8px 12px',
                  borderRadius: 10,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Eliminar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartRegistration}
                disabled={registering}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: 10,
                  fontSize: 11.5,
                  fontWeight: 700,
                  cursor: registering ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: '0 4px 12px rgba(123, 90, 217, 0.2)',
                }}
              >
                {registering ? 'Configurando...' : 'Activar'}
              </button>
            )}
          </div>
        </div>
      </Surface>

      {showBiometricScan && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Configurar passkey local demo"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              width: 290,
              background: 'rgba(30, 32, 45, 0.95)',
              border: '0.5px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 24,
              padding: 24,
              textAlign: 'center',
              boxShadow: '0 20px 48px rgba(0,0,0,0.5)',
              animation: 'scaleInPasskey 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  background: 'rgba(123, 90, 217, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent)',
                  fontSize: 36,
                  animation: 'pulseFingerprint 1.5s infinite',
                }}
              >
                ID
              </div>
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: 17,
                fontWeight: 800,
                color: '#fff',
                letterSpacing: -0.4,
              }}
            >
              Passkey local demo
            </h3>
            <p
              style={{
                margin: '8px 0 24px',
                fontSize: 13,
                color: 'rgba(255,255,255,0.6)',
                lineHeight: 1.5,
              }}
            >
              Este prototipo sólo guarda un marcador local del dispositivo. El login real por
              passkey requiere verificación segura en backend.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={handleSimulatedCancel}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: 'none',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSimulatedSuccess}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Guardar demo
              </button>
            </div>
          </div>
          <style>{`
            @keyframes scaleInPasskey {
              from { transform: scale(0.9); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            @keyframes pulseFingerprint {
              0% { box-shadow: 0 0 0 0 rgba(123, 90, 217, 0.4); }
              70% { box-shadow: 0 0 0 15px rgba(123, 90, 217, 0); }
              100% { box-shadow: 0 0 0 0 rgba(123, 90, 217, 0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
