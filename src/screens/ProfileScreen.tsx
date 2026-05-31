import { useRef, useState, useEffect } from 'react';
import Surface from '@/components/Surface';
import { Toast } from '@/components/Section';
import {
  CheckIcon,
  DownloadIcon,
  UploadIcon,
  TrashIcon,
  InfoIcon,
  ShareIcon,
  GalleryIcon,
} from '@/components/icons';
import { useCollectionSummary, useSyncStatus } from '@/lib/hooks';
import {
  clearCollection,
  exportCollection,
  importCollection,
  resetRecentlyViewed,
  getCollection,
  replaceCollection,
  syncToCloud,
  mergeCollections,
} from '@/lib/collectionStorage';
import { hasApiKey, clearApiCache, getCachedCard } from '@/lib/pokemonTcgApi';
import { isServerOcrEnabled } from '@/lib/cardRecognition';
import { formatInt } from '@/lib/formatters';
import { prefersMXN, setPrefersMXN, getEstimatedPrice } from '@/lib/pricing';
import { useAuth } from '@/lib/authContext';
import { auth, db, isFirebaseConfigured } from '@/lib/firebaseClient';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import CollectionShareModal from '@/components/CollectionShareModal';
import PasskeyManager from '@/components/PasskeyManager';
import {
  getPushSubscription,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
} from '@/lib/webPush';
import { processAchievementEvent } from '@/lib/achievements';
import { dispatchAchievement } from '@/app/App';
import { triggerHaptic } from '@/lib/haptic';
import type { PokemonCard } from '@/types/pokemon';
import { useI18n } from '@/lib/i18n';
import { THEME_ACCENTS, applyThemeAccent, getAppliedThemeAccent } from '@/lib/themeAccent';

const APP_VERSION = '1.1.3';
const SERVER_ASSISTANT_ENABLED = import.meta.env.VITE_CARD_ASSISTANT_MODE === 'server';

/**
 * Profile / Settings — info, export/import, clear local data, disclaimer.
 */
export default function ProfileScreen() {
  const { t } = useI18n();
  const summary = useCollectionSummary();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [isPrefetching, setIsPrefetching] = useState(false);
  const [prefetchTotal, setPrefetchTotal] = useState(0);
  const [prefetchCurrent, setPrefetchCurrent] = useState(0);
  const [prefetchStatus, setPrefetchStatus] = useState<
    'idle' | 'fetching_cards' | 'prefetching_images' | 'success' | 'error'
  >('idle');
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const syncStatus = useSyncStatus();
  const [isSyncingManual, setIsSyncingManual] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [remoteState, setRemoteState] = useState<any>(null);
  const [mergeOption, setMergeOption] = useState<'smart' | 'local' | 'remote'>('smart');

  useEffect(() => {
    getPushSubscription().then((sub) => {
      setIsPushSubscribed(!!sub);
    });
  }, []);

  const handleManualSync = async () => {
    if (!user) return;
    setIsSyncingManual(true);
    triggerHaptic('light');

    try {
      const docRef = doc(db, 'collections', user.uid);
      const docSnap = await getDoc(docRef);

      const localState = getCollection();

      if (!docSnap.exists()) {
        // No remote collection exists yet, upload local
        await syncToCloud(localState);
        showToast('¡Colección sincronizada por primera vez en la nube! 🚀');
        setIsSyncingManual(false);
        return;
      }

      const data = docSnap.data();
      const remoteCollection = data?.state;

      if (!remoteCollection) {
        await syncToCloud(localState);
        showToast('¡Colección sincronizada por primera vez en la nube! 🚀');
        setIsSyncingManual(false);
        return;
      }

      const localCardCount = Object.keys(localState.cards || {}).length;
      const remoteCardCount = Object.keys(remoteCollection.cards || {}).length;

      // Check if they are identical
      const localStr = JSON.stringify(localState.cards || {});
      const remoteStr = JSON.stringify(remoteCollection.cards || {});

      if (localStr === remoteStr) {
        showToast('¡Tu colección está completamente al día! ✨');
        setIsSyncingManual(false);
        return;
      }

      // If there are differences and both have cards, prompt merge
      if (localCardCount > 0 && remoteCardCount > 0) {
        setRemoteState(remoteCollection);
        setShowMergeModal(true);
      } else {
        // If one is empty, merge automatically
        const merged = mergeCollections(localState, remoteCollection);
        replaceCollection(merged);
        showToast('Colección combinada automáticamente con éxito. 🔄');
      }
    } catch (err) {
      console.error('Error manually syncing:', err);
      showToast('Error al sincronizar con la nube.');
    } finally {
      setIsSyncingManual(false);
    }
  };

  const handleConfirmMerge = async () => {
    if (!user || !remoteState) return;
    setIsSyncingManual(true);
    setShowMergeModal(false);
    triggerHaptic('medium');

    try {
      const localState = getCollection();
      let finalState = localState;

      if (mergeOption === 'smart') {
        finalState = mergeCollections(localState, remoteState);
        showToast('Colecciones combinadas con éxito. 🧠');
      } else if (mergeOption === 'local') {
        finalState = localState;
        showToast('Colección local guardada y subida a la nube. ⬆️');
      } else if (mergeOption === 'remote') {
        finalState = remoteState;
        showToast('Colección de la nube descargada con éxito. ⬇️');
      }

      replaceCollection(finalState);
    } catch (err) {
      console.error('Error executing merge choice:', err);
      showToast('Error al aplicar la fusión.');
    } finally {
      setIsSyncingManual(false);
      setRemoteState(null);
    }
  };

  const handlePushToggle = async () => {
    try {
      if (isPushSubscribed) {
        const success = await unsubscribeFromPushNotifications();
        if (success) {
          setIsPushSubscribed(false);
          showToast('Alertas de precios desactivadas.');
        }
      } else {
        const subscription = await subscribeToPushNotifications();
        if (subscription) {
          setIsPushSubscribed(true);
          showToast('¡Alertas push activadas con éxito! 🚀');
        }
      }
      triggerHaptic('light');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Error al configurar alertas push.');
      triggerHaptic('medium');
    }
  };

  // Check collection-based achievements on mount
  useEffect(() => {
    const collection = getCollection();
    const ownedCards = Object.values(collection.cards).filter((c) => c.owned);
    // Detect rare holo or better (we check by card rarity if available in cached data)
    // For now we proxy with ownedCount thresholds and fire the event
    const achieved = processAchievementEvent({
      type: 'collection_updated',
      ownedCount: ownedCards.length,
      hasRareHolo: false, // full rarity check done in HomeScreen with card data
      fireCardCount: 0, // same
    });
    achieved.forEach(dispatchAchievement);
  }, []);
  const [mxnEnabled, setMxnEnabled] = useState(prefersMXN());
  const [activeTheme, setActiveTheme] = useState(getAppliedThemeAccent);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('carddex_auto_scan_enabled');
      return stored !== 'false';
    } catch {
      return true;
    }
  });

  const handleCycleThemeAccent = () => {
    const currentId = activeTheme.id;
    const currentIndex = THEME_ACCENTS.findIndex((t) => t.id === currentId);
    const nextIndex = (currentIndex + 1) % THEME_ACCENTS.length;
    const nextTheme = THEME_ACCENTS[nextIndex];
    applyThemeAccent(nextTheme.id);
    setActiveTheme(nextTheme);
    triggerHaptic('medium');
    showToast(`Tema cambiado a ${nextTheme.emoji} ${nextTheme.name}`);
  };

  const handleToggleAutoScan = () => {
    const next = !autoScanEnabled;
    setAutoScanEnabled(next);
    try {
      localStorage.setItem('carddex_auto_scan_enabled', String(next));
    } catch {}
    triggerHaptic('light');
    showToast(
      next ? '👁️ Auto-escaneo OpenCV activado' : 'Auto-escaneo desactivado. Captura manual activa.'
    );
  };
  const { user } = useAuth();
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [hasPasskeyStored, setHasPasskeyStored] = useState(false);
  const [biometricScanning, setBiometricScanning] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('carddex.auth.passkey');
      setHasPasskeyStored(!!stored);
    } catch {}
  }, [user]);

  const [scanLanguage, setScanLanguage] = useState<'AUTO' | 'EN' | 'ES' | 'JP'>(() => {
    try {
      const saved = localStorage.getItem('carddex.scanner.language');
      if (saved === 'EN' || saved === 'ES' || saved === 'JP') return saved as any;
    } catch {}
    return 'AUTO';
  });

  const handleToggleScanLanguage = () => {
    const langs: ('AUTO' | 'EN' | 'ES' | 'JP')[] = ['AUTO', 'EN', 'ES', 'JP'];
    const nextIdx = (langs.indexOf(scanLanguage) + 1) % langs.length;
    const nextLang = langs[nextIdx];
    setScanLanguage(nextLang);
    try {
      localStorage.setItem('carddex.scanner.language', nextLang);
    } catch {}
    showToast(
      t('profile.scanLanguageChanged', { lang: nextLang }) || `Idioma de escaneo: ${nextLang}`
    );
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword) {
      showToast(t('profile.loginRequiredFields') || 'Ingresa correo y contraseña');
      return;
    }
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, authEmail, authPassword);
      showToast(t('profile.sessionStarted') || 'Sesión iniciada');
    } catch (err: any) {
      showToast(err.message || 'Error al iniciar sesión');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || !authName) {
      showToast(t('profile.signupRequiredFields') || 'Completa todos los campos para registrarte');
      return;
    }
    setAuthLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      if (userCredential.user) {
        await updateProfile(userCredential.user, { displayName: authName.trim() });
      }
      showToast(t('profile.accountCreated') || 'Cuenta creada y sesión iniciada');
    } catch (err: any) {
      showToast(err.message || 'Error al registrarse');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showToast(t('profile.loggedOut') || 'Sesión cerrada');
    } catch (err: any) {
      showToast(err.message || 'Error al cerrar sesión');
    }
  };

  const handleBiometricLogin = async () => {
    if (biometricScanning) return;
    setBiometricScanning(true);
    triggerHaptic('light');
    window.setTimeout(() => {
      setBiometricScanning(false);
      showToast('Passkey local demo: no guarda contraseña ni inicia sesión automáticamente.');
      triggerHaptic('warning');
    }, 350);
  };

  const handleUpdateName = async () => {
    if (!editNameValue.trim()) {
      setIsEditingName(false);
      return;
    }
    if (!auth.currentUser) return;
    setAuthLoading(true);
    try {
      await updateProfile(auth.currentUser, { displayName: editNameValue.trim() });
      showToast(t('profile.nameUpdated') || 'Nombre actualizado');
      setIsEditingName(false);
    } catch (err: any) {
      showToast(err.message || 'Error al actualizar el nombre');
    } finally {
      setAuthLoading(false);
    }
  };

  const apiKeyConfigured = hasApiKey();
  const serverOcrConfigured = isServerOcrEnabled();

  const handleShareProfile = async () => {
    if (!user) return;
    const url = `${window.location.origin}/u/${user.uid}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(t('profile.linkCopied') || 'Enlace copiado al portapapeles');
    } catch {
      showToast(t('profile.linkCopyError') || 'No se pudo copiar el enlace');
    }
  };

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
      showToast(t('profile.exportSuccess') || 'Colección exportada');
    } catch {
      showToast(t('profile.exportError') || 'Error al exportar');
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
      showToast(
        t('profile.importSuccess', { count: formatInt(imported) }) ||
          `Se importaron ${formatInt(imported)} cartas`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Archivo inválido';
      showToast(t('profile.importError', { msg }) || `Error al importar: ${msg}`);
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
    showToast(t('profile.dataCleared') || 'Datos locales borrados');
  };

  const handleResetRecent = () => {
    resetRecentlyViewed();
    showToast(t('profile.recentCleared') || 'Historial reciente vaciado');
  };

  const handleToggleMxn = () => {
    const next = !mxnEnabled;
    setPrefersMXN(next);
    setMxnEnabled(next);
    window.location.reload();
  };

  const handlePrefetchImages = async () => {
    if (isPrefetching) return;
    triggerHaptic('light');

    const col = getCollection();
    const ownedIds = Object.values(col.cards)
      .filter((c) => c.owned)
      .map((c) => c.cardId);

    if (ownedIds.length === 0) {
      showToast('No tienes cartas en tu colección para precargar.');
      return;
    }

    setIsPrefetching(true);
    setPrefetchStatus('fetching_cards');
    setPrefetchCurrent(0);
    setPrefetchTotal(ownedIds.length);

    try {
      const { getCardsByIds } = await import('@/lib/pokemonTcgApi');
      const cards = await getCardsByIds(ownedIds);

      const urls: string[] = [];
      cards.forEach((card) => {
        if (card.images?.small) urls.push(card.images.small);
        if (card.images?.large) urls.push(card.images.large);
      });

      if (urls.length === 0) {
        setPrefetchStatus('success');
        setIsPrefetching(false);
        showToast('Colección offline actualizada (sin imágenes pendientes).');
        return;
      }

      setPrefetchStatus('prefetching_images');
      setPrefetchTotal(urls.length);
      setPrefetchCurrent(0);

      const BATCH_SIZE = 5;
      for (let i = 0; i < urls.length; i += BATCH_SIZE) {
        const batch = urls.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (url) => {
            try {
              await fetch(url, { mode: 'no-cors', cache: 'force-cache' });
            } catch (e) {
              console.warn('[Offline Cache] Failed to prefetch image:', url, e);
            } finally {
              setPrefetchCurrent((prev) => prev + 1);
            }
          })
        );
      }

      setPrefetchStatus('success');
      triggerHaptic('success');
      showToast('¡Colección offline lista para usar!');
    } catch (err) {
      console.error('[Offline Cache] Prefetch failed:', err);
      setPrefetchStatus('error');
      triggerHaptic('warning');
      showToast('Ocurrió un error al precargar las imágenes.');
    } finally {
      setIsPrefetching(false);
    }
  };

  const getShowcaseCards = (): PokemonCard[] => {
    const col = getCollection();
    const ownedIds = Object.values(col.cards)
      .filter((c) => c.owned)
      .map((c) => c.cardId);

    const ownedCards = ownedIds.map((id) => getCachedCard(id)).filter((c): c is PokemonCard => !!c);

    const favoriteCards = ownedCards.filter((c) => col.cards[c.id]?.favorite);

    const showcase = [...favoriteCards];

    if (showcase.length < 4) {
      const remainingOwned = ownedCards.filter((c) => !showcase.some((sc) => sc.id === c.id));
      const sortedByPrice = [...remainingOwned].sort((a, b) => {
        const pa = getEstimatedPrice(a)?.value ?? 0;
        const pb = getEstimatedPrice(b)?.value ?? 0;
        return pb - pa;
      });
      showcase.push(...sortedByPrice.slice(0, 4 - showcase.length));
    }

    if (showcase.length < 4) {
      const remainingOwned = ownedCards.filter((c) => !showcase.some((sc) => sc.id === c.id));
      showcase.push(...remainingOwned.slice(0, 4 - showcase.length));
    }

    return showcase.slice(0, 4);
  };

  return (
    <div style={{ paddingBottom: 110 }}>
      <Toast
        message={toast ?? ''}
        visible={!!toast}
        onHide={() => setToast(null)}
        duration={2000}
      />

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
          {!isFirebaseConfigured() ? (
            <div style={{ padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>CD</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
                Perfil local demo
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                Tu colección se guarda en este navegador. Perfiles públicos y sincronización
                requieren Firebase configurado en servidor.
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-around',
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: '0.5px solid var(--hairline)',
                }}
              >
                <Stat n={formatInt(summary.uniqueCount)} l="Únicas" />
                <Stat n={formatInt(summary.favoriteCount)} l="Favoritas" />
                <Stat n={formatInt(summary.wishlistCount)} l="Wishlist" />
              </div>
            </div>
          ) : !user ? (
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                {isLoginMode ? 'Accede a tu cuenta' : 'Crea una cuenta'}
              </div>

              {isLoginMode && hasPasskeyStored && (
                <button
                  type="button"
                  onClick={handleBiometricLogin}
                  disabled={authLoading || biometricScanning}
                  style={{
                    width: '100%',
                    background:
                      'linear-gradient(135deg, rgba(123, 90, 217, 0.12), rgba(47, 111, 224, 0.12))',
                    color: 'var(--accent)',
                    border: '1px dashed rgba(123, 90, 217, 0.4)',
                    padding: 14,
                    borderRadius: 14,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    marginBottom: 16,
                    boxShadow: '0 4px 12px rgba(123, 90, 217, 0.05)',
                    transition: 'all 200ms ease',
                  }}
                >
                  <span style={{ fontSize: 20 }}>🫵</span>
                  {biometricScanning ? 'Verificando…' : 'Passkey local configurada'}
                </button>
              )}

              <form
                onSubmit={isLoginMode ? handleLogin : handleSignup}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                {!isLoginMode && (
                  <input
                    type="text"
                    placeholder="Tu nombre o apodo"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--hairline)',
                      background: 'var(--bg)',
                      color: 'var(--ink)',
                    }}
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '1px solid var(--hairline)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                  }}
                  required
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: 12,
                    border: '1px solid var(--hairline)',
                    background: 'var(--bg)',
                    color: 'var(--ink)',
                  }}
                  required
                />
                <div style={{ display: 'flex', gap: 12 }}>
                  <button
                    type="submit"
                    disabled={authLoading}
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontWeight: 700,
                    }}
                  >
                    {authLoading ? '...' : isLoginMode ? 'Iniciar Sesión' : 'Registrarse'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsLoginMode(!isLoginMode)}
                    disabled={authLoading}
                    style={{
                      flex: 1,
                      padding: 14,
                      borderRadius: 12,
                      border: '1px solid var(--accent)',
                      background: 'transparent',
                      color: 'var(--accent)',
                      fontWeight: 700,
                    }}
                  >
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
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 800,
                }}
              >
                {(user.displayName?.[0] || user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
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
                      onChange={(e) => setEditNameValue(e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 8,
                        border: '1px solid var(--hairline)',
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        fontSize: 16,
                      }}
                    />
                    <button
                      onClick={handleUpdateName}
                      disabled={authLoading}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--accent)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <>
                    <span>{user.displayName || user.user_metadata?.full_name || user.email}</span>
                    <button
                      onClick={() => {
                        setEditNameValue(user.displayName || user.user_metadata?.full_name || '');
                        setIsEditingName(true);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--muted)',
                        cursor: 'pointer',
                        fontSize: 12,
                        textDecoration: 'underline',
                      }}
                    >
                      Editar
                    </button>
                  </>
                )}
              </div>
              <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                {formatInt(summary.uniqueCount)} únicas · {formatInt(summary.totalQuantity)} cartas
              </div>
              <button
                onClick={handleLogout}
                style={{
                  marginTop: 12,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--error)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
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
              <button
                onClick={handleShareProfile}
                style={{
                  marginTop: 20,
                  width: '100%',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  padding: 14,
                  borderRadius: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <ShareIcon size={18} />
                Copiar enlace a mi perfil público
              </button>
              <PasskeyManager
                userEmail={user?.email || undefined}
                userName={user?.displayName || user?.user_metadata?.full_name || undefined}
                onToast={showToast}
              />
            </>
          )}
        </Surface>
      </div>

      {/* Cloud Backup & Sync Controls */}
      {user && (
        <div style={{ padding: '0 14px 14px' }}>
          <SectionTitle>Sincronización en la Nube</SectionTitle>
          <Surface style={{ padding: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Premium Glassmorphic Sync Status Banner */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  background:
                    syncStatus === 'synced'
                      ? 'rgba(52, 199, 89, 0.08)'
                      : syncStatus === 'syncing' || isSyncingManual
                        ? 'rgba(0, 188, 212, 0.08)'
                        : syncStatus === 'offline-pending'
                          ? 'rgba(255, 179, 0, 0.08)'
                          : syncStatus === 'error'
                            ? 'rgba(255, 59, 48, 0.08)'
                            : 'rgba(255, 255, 255, 0.03)',
                  border: `1px solid ${
                    syncStatus === 'synced'
                      ? 'rgba(52, 199, 89, 0.25)'
                      : syncStatus === 'syncing' || isSyncingManual
                        ? 'rgba(0, 188, 212, 0.25)'
                        : syncStatus === 'offline-pending'
                          ? 'rgba(255, 179, 0, 0.25)'
                          : syncStatus === 'error'
                            ? 'rgba(255, 59, 48, 0.25)'
                            : 'rgba(255, 255, 255, 0.05)'
                  }`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  transition: 'all 300ms ease',
                }}
              >
                <div
                  style={{
                    fontSize: 20,
                    animation:
                      syncStatus === 'syncing' || isSyncingManual
                        ? 'spinScreenLoader 2s linear infinite'
                        : 'none',
                    display: 'inline-block',
                  }}
                >
                  {syncStatus === 'synced'
                    ? '🟢'
                    : syncStatus === 'syncing' || isSyncingManual
                      ? '🔄'
                      : syncStatus === 'offline-pending'
                        ? '🟡'
                        : syncStatus === 'error'
                          ? '🔴'
                          : '☁️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: 'var(--ink)',
                    }}
                  >
                    {syncStatus === 'synced'
                      ? 'Colección Sincronizada'
                      : syncStatus === 'syncing' || isSyncingManual
                        ? 'Sincronizando...'
                        : syncStatus === 'offline-pending'
                          ? 'Pendiente (Modo Offline)'
                          : syncStatus === 'error'
                            ? 'Error de Conexión'
                            : 'Copia de Seguridad Activa'}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--muted)',
                      marginTop: 2,
                      lineHeight: 1.4,
                    }}
                  >
                    {syncStatus === 'synced'
                      ? 'Todos los datos de tu binder están seguros en la nube.'
                      : syncStatus === 'syncing' || isSyncingManual
                        ? 'Subiendo y de-duplicando cambios de cartas en tiempo real.'
                        : syncStatus === 'offline-pending'
                          ? 'Los cambios se guardan localmente y se subirán al reconectar.'
                          : syncStatus === 'error'
                            ? 'No pudimos conectar con el servidor. Toca para reintentar.'
                            : 'Resguarda tu colección contra pérdidas físicas.'}
                  </div>
                </div>
              </div>

              {/* Sync Action Buttons */}
              <button
                onClick={handleManualSync}
                disabled={isSyncingManual || syncStatus === 'syncing'}
                style={{
                  width: '100%',
                  padding: 14,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
                  border: 'none',
                  borderRadius: 12,
                  color: '#fff',
                  fontWeight: 700,
                  cursor: isSyncingManual || syncStatus === 'syncing' ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(123, 90, 217, 0.15)',
                  transition: 'all 200ms ease',
                }}
              >
                {isSyncingManual || syncStatus === 'syncing' ? (
                  <>
                    <span
                      className="spinner-mini"
                      style={{
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255,255,255,0.2)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'spinScreenLoader 1s linear infinite',
                      }}
                    />
                    <span>Conectando...</span>
                  </>
                ) : (
                  <>
                    <span>🔄 Sincronizar y Comparar ahora</span>
                  </>
                )}
              </button>
            </div>
          </Surface>
        </div>
      )}

      {/* Showcase Poster Export */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Compartir mi vitrina</SectionTitle>
        <Surface style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: 'rgba(0, 188, 212, 0.12)',
                color: '#00BCD4',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <GalleryIcon size={18} />
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
                Showcase Poster
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                Genera una infografía elegante de tus cartas destacadas.
              </div>
            </div>
            <button
              onClick={() => setIsShareModalOpen(true)}
              style={{
                background: 'var(--accent-tint)',
                border: 'none',
                color: 'var(--accent)',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Generar
            </button>
          </div>
        </Surface>
      </div>

      {/* Offline Collection Prefetcher */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Colección Offline</SectionTitle>
        <Surface style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background: 'rgba(123, 90, 217, 0.12)',
                  color: 'var(--accent)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                }}
              >
                📶
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
                  Acceso Offline Total
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  Pre-descarga las imágenes de tu binder para visualizarlas sin conexión.
                </div>
              </div>
            </div>

            {prefetchStatus !== 'idle' && (
              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 11,
                    color: 'var(--muted)',
                    marginBottom: 6,
                  }}
                >
                  <span>
                    {prefetchStatus === 'fetching_cards' && 'Obteniendo datos de las cartas...'}
                    {prefetchStatus === 'prefetching_images' &&
                      `Descargando imágenes: ${prefetchCurrent} de ${prefetchTotal}`}
                    {prefetchStatus === 'success' && '¡Completado! Todas las imágenes en caché'}
                    {prefetchStatus === 'error' && 'Error en la descarga. Intenta de nuevo.'}
                  </span>
                  {prefetchTotal > 0 && prefetchStatus === 'prefetching_images' && (
                    <span>{Math.round((prefetchCurrent / prefetchTotal) * 100)}%</span>
                  )}
                </div>
                <div
                  style={{
                    height: 6,
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      background:
                        prefetchStatus === 'error'
                          ? 'var(--error)'
                          : 'linear-gradient(90deg, var(--accent), #00BCD4)',
                      width:
                        prefetchTotal > 0 ? `${(prefetchCurrent / prefetchTotal) * 100}%` : '0%',
                      transition: 'width 200ms ease-out',
                    }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handlePrefetchImages}
              disabled={isPrefetching}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isPrefetching
                  ? 'rgba(255,255,255,0.04)'
                  : prefetchStatus === 'success'
                    ? 'rgba(52,199,89,0.1)'
                    : 'linear-gradient(135deg, rgba(123,90,217,0.12), rgba(0,188,212,0.12))',
                border: isPrefetching
                  ? '1px solid rgba(255,255,255,0.06)'
                  : prefetchStatus === 'success'
                    ? '1px solid rgba(52,199,89,0.3)'
                    : '1px solid rgba(123,90,217,0.3)',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                color: prefetchStatus === 'success' ? 'var(--success)' : 'var(--accent)',
                cursor: isPrefetching ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 200ms ease',
              }}
            >
              {isPrefetching ? (
                <>
                  <span
                    className="spinner-mini"
                    style={{
                      width: 14,
                      height: 14,
                      border: '2px solid rgba(255,255,255,0.2)',
                      borderTopColor: 'var(--accent)',
                      borderRadius: '50%',
                      display: 'inline-block',
                      animation: 'spinScreenLoader 1s linear infinite',
                    }}
                  />
                  <span style={{ marginLeft: 8 }}>Descargando colección...</span>
                </>
              ) : prefetchStatus === 'success' ? (
                <span>✓ Colección precargada con éxito</span>
              ) : (
                <span>⚡ Pre-descargar Imágenes de mi Colección</span>
              )}
            </button>
          </div>
        </Surface>
      </div>

      {/* Premium Price Alerts (Web Push) */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Notificaciones Premium</SectionTitle>
        <Surface style={{ padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 11,
                  background:
                    'linear-gradient(135deg, rgba(255, 179, 0, 0.15), rgba(242, 201, 76, 0.15))',
                  color: '#FFB300',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  boxShadow: '0 0 10px rgba(255, 179, 0, 0.2)',
                }}
              >
                🔔
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    letterSpacing: -0.2,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Alertas en Tiempo Real
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: '#FFB300',
                      background: 'rgba(255, 179, 0, 0.12)',
                      padding: '2px 6px',
                      borderRadius: 6,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      border: '0.5px solid rgba(255, 179, 0, 0.3)',
                    }}
                  >
                    PRO
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}>
                  Monitoreo en segundo plano de tu binder. Recibe notificaciones push si alguna
                  carta sube o baja más del 20%.
                </div>
              </div>
            </div>

            <button
              onClick={handlePushToggle}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: isPushSubscribed
                  ? 'rgba(255, 179, 0, 0.08)'
                  : 'linear-gradient(135deg, rgba(255, 179, 0, 0.12), rgba(242, 201, 76, 0.12))',
                border: isPushSubscribed
                  ? '1px solid rgba(255, 179, 0, 0.4)'
                  : '1px solid rgba(255, 179, 0, 0.25)',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 700,
                color: '#FFB300',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'all 200ms ease',
                boxShadow: isPushSubscribed ? 'none' : '0 4px 12px rgba(255, 179, 0, 0.05)',
              }}
            >
              {isPushSubscribed ? (
                <span>✓ Alertas Push Activadas (Premium)</span>
              ) : (
                <span>⚡ Activar Alertas de Precios Instantáneas</span>
              )}
            </button>
          </div>
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
                background: apiKeyConfigured ? 'rgba(52,199,89,0.15)' : 'rgba(242,153,74,0.15)',
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
                {apiKeyConfigured ? 'API configurada' : 'Acceso público sin key en frontend'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                {apiKeyConfigured
                  ? 'Base URL: pokemontcg.io'
                  : 'Las consultas usan el límite público de pokemontcg.io.'}
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
          <Divider />
          <ActionRow
            icon={<span style={{ fontWeight: 800, fontSize: 16 }}>🌐</span>}
            label="Idioma de Escaneo (OCR)"
            description={`Idioma prioritario actual: ${scanLanguage}`}
            onClick={handleToggleScanLanguage}
          />
          <Divider />
          <ActionRow
            icon={<span style={{ fontSize: 16 }}>🎨</span>}
            label="Color de Acento (Tema)"
            description={`Acento actual: ${activeTheme.emoji} ${activeTheme.name}`}
            onClick={handleCycleThemeAccent}
          />
          <Divider />
          <ActionRow
            icon={<span style={{ fontSize: 16 }}>👁️</span>}
            label="Auto-Escaneo Inteligente (OpenCV)"
            description={
              autoScanEnabled
                ? 'Captura automática al alinear la carta'
                : 'Desactivado (toca para capturar)'
            }
            onClick={handleToggleAutoScan}
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
                {serverOcrConfigured ? 'OCR servidor activo' : 'Assisted scan prototype'}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {serverOcrConfigured
                  ? 'La captura se envía al endpoint serverless para extraer nombre/número. La key LLM vive sólo en servidor.'
                  : 'La cámara se usa localmente; CardDex muestra sugerencias asistidas y permite corregir manualmente.'}
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
                {SERVER_ASSISTANT_ENABLED ? 'Asistente LLM vía backend' : 'Asistente demo local'}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--muted)',
                  marginTop: 4,
                  lineHeight: 1.5,
                }}
              >
                {SERVER_ASSISTANT_ENABLED
                  ? 'Usa contexto acotado de la carta y no expone API keys en el frontend.'
                  : 'Responde con reglas y datos disponibles de la carta. Preparado para LLM seguro vía backend.'}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      {/* Demo boundaries & privacy */}
      <div style={{ padding: '0 14px 14px' }}>
        <SectionTitle>Demo Boundaries & Privacy</SectionTitle>
        <Surface style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55 }}>
            CardDex es una demo personal: colección y preferencias viven en este navegador salvo que
            configures Supabase. El scanner no guarda video; una captura sólo sale del dispositivo
            si activas OCR de servidor. El asistente local no inventa datos y los precios son
            referencia, no consejo financiero. Passkey local no guarda contraseñas.
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
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Versión {APP_VERSION}</div>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: 12,
              lineHeight: 1.55,
              color: 'var(--muted)',
            }}
          >
            Proyecto personal sin fines comerciales para llevar el control de tu colección de cartas
            Pokémon TCG. CardDex no está afiliado, asociado, autorizado, respaldado por, ni
            vinculado oficialmente con Nintendo, The Pokémon Company, Creatures Inc. ni Game Freak.
            Todas las marcas y derechos pertenecen a sus respectivos propietarios. Los datos de
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
      <CollectionShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        summary={summary}
        showcaseCards={getShowcaseCards()}
        username={user?.displayName || user?.user_metadata?.full_name || user?.email || 'Mi Colección'}
        userId={user?.uid || ''}
        onShowToast={showToast}
      />

      {/* Merge Conflict / Deduplication Resolution Modal */}
      {showMergeModal && remoteState && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(9, 11, 16, 0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 16px',
          }}
          onClick={() => setShowMergeModal(false)}
        >
          <Surface
            style={{
              width: '100%',
              maxWidth: 440,
              background: 'var(--surface)',
              border: '1px solid var(--hairline)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
              borderRadius: 24,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              color: 'var(--ink)',
            }}
            onClick={(e: any) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.4 }}>
                🔄 Fusión de Colecciones
              </h3>
              <button
                onClick={() => setShowMergeModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
              Detectamos diferencias entre la colección de este dispositivo y tu copia de seguridad
              en la nube. Selecciona cómo deseas unificarlas:
            </p>

            {/* Collection stats side-by-side comparison */}
            <div
              style={{
                display: 'flex',
                gap: 12,
                background: 'rgba(255, 255, 255, 0.03)',
                padding: 12,
                borderRadius: 14,
                border: '0.5px solid var(--hairline)',
              }}
            >
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                  DISPOSITIVO LOCAL
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink)', marginTop: 4 }}>
                  {Object.keys(getCollection().cards || {}).length}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  Cartas registradas
                </div>
              </div>
              <div style={{ width: 1, background: 'var(--hairline)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                  COPIA EN LA NUBE
                </div>
                <div
                  style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', marginTop: 4 }}
                >
                  {Object.keys(remoteState.cards || {}).length}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  Cartas registradas
                </div>
              </div>
            </div>

            {/* Merge options list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Option 1: Smart Merge */}
              <button
                onClick={() => setMergeOption('smart')}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: mergeOption === 'smart' ? 'var(--accent-tint)' : 'transparent',
                  border: `2px solid ${mergeOption === 'smart' ? 'var(--accent)' : 'var(--hairline)'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontSize: 18, marginTop: 2 }}>🧠</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    Fusión Automática Inteligente
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}
                  >
                    Une ambas listas sumando las colecciones y conservando las ediciones más
                    recientes de cada carta.
                  </div>
                </div>
              </button>

              {/* Option 2: Overwrite remote with local */}
              <button
                onClick={() => setMergeOption('local')}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: mergeOption === 'local' ? 'rgba(52, 199, 89, 0.08)' : 'transparent',
                  border: `2px solid ${mergeOption === 'local' ? 'var(--success)' : 'var(--hairline)'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontSize: 18, marginTop: 2 }}>⬆️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    Conservar Local (Subir a la Nube)
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}
                  >
                    Reemplaza el binder de la nube con los datos de este dispositivo.
                  </div>
                </div>
              </button>

              {/* Option 3: Overwrite local with remote */}
              <button
                onClick={() => setMergeOption('remote')}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  borderRadius: 14,
                  background: mergeOption === 'remote' ? 'var(--accent-tint)' : 'transparent',
                  border: `2px solid ${mergeOption === 'remote' ? 'var(--accent)' : 'var(--hairline)'}`,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  transition: 'all 150ms ease',
                }}
              >
                <div style={{ fontSize: 18, marginTop: 2 }}>⬇️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    Conservar Nube (Descargar en Dispositivo)
                  </div>
                  <div
                    style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, lineHeight: 1.4 }}
                  >
                    Descarta los cambios locales y descarga tu copia de seguridad de la nube.
                  </div>
                </div>
              </button>
            </div>

            {/* Modal actions */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setShowMergeModal(false)}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  border: '1px solid var(--hairline)',
                  background: 'transparent',
                  color: 'var(--ink)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmMerge}
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 12,
                  border: 'none',
                  background: 'var(--accent)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(123, 90, 217, 0.2)',
                }}
              >
                Confirmar Fusión
              </button>
            </div>
          </Surface>
        </div>
      )}
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
          background: destructive ? 'rgba(255,59,48,0.10)' : 'var(--accent-tint)',
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
