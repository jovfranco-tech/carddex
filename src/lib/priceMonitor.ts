import { getCardById } from './pokemonTcgApi';
import { getEstimatedPrice, type Currency } from './pricing';
import type { PokemonCard } from '@/types/pokemon';

export interface PriceAlert {
  id: string;
  cardId: string;
  cardName: string;
  cardImage: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number; // e.g., 14.8 or -11.2
  timestamp: string;
  read: boolean;
}

/** Stored per-card price baseline: last known price + when it was recorded. */
export interface PriceBaseline {
  price: number;
  currency: Currency;
  recordedAt: string; // ISO
}

const STORAGE_KEYS = {
  alerts: 'carddex.price_alerts.v1',
  lastCheck: 'carddex.price_alerts.last_check',
  baselines: 'carddex.price_baselines.v1',
} as const;

const ALERT_SUBSCRIBERS = new Set<() => void>();

function notifyAlerts() {
  ALERT_SUBSCRIBERS.forEach((fn) => fn());
}

export function subscribePriceAlerts(listener: () => void): () => void {
  ALERT_SUBSCRIBERS.add(listener);
  return () => {
    ALERT_SUBSCRIBERS.delete(listener);
  };
}

/** Returns all saved price alerts. */
export function getPriceAlerts(): PriceAlert[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.alerts);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Returns the stored price baselines for all cards. */
export function getBaselines(): Record<string, PriceBaseline> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.baselines);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Saves (or updates) price baselines for the given cards. */
export function saveBaselines(cards: PokemonCard[]): void {
  if (typeof localStorage === 'undefined') return;
  const baselines = getBaselines();
  const now = new Date().toISOString();

  for (const card of cards) {
    const price = getEstimatedPrice(card);
    if (!price) continue;
    baselines[card.id] = {
      price: price.value,
      currency: price.currency,
      recordedAt: now,
    };
  }

  try {
    localStorage.setItem(STORAGE_KEYS.baselines, JSON.stringify(baselines));
  } catch {
    /* localStorage full — ignore */
  }
}

/**
 * Updates the native PWA app badge with the count of unread alerts.
 */
export function updateAppBadge(alerts: PriceAlert[]): void {
  const unreadCount = alerts.filter((a) => !a.read).length;
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      if (unreadCount > 0) {
        (navigator as any).setAppBadge(unreadCount).catch((err: any) => {
          console.warn('setAppBadge failed:', err);
        });
      } else {
        (navigator as any).clearAppBadge().catch((err: any) => {
          console.warn('clearAppBadge failed:', err);
        });
      }
    } catch (err) {
      console.warn('Badge API is unsupported or failed:', err);
    }
  }
}

/**
 * Requests push notification permission from the user.
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

/**
 * Fires a native PWA push notification for a significant price change.
 */
function sendPriceNotification(alert: PriceAlert): void {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const direction = alert.changePercent > 0 ? '📈' : '📉';
  const sign = alert.changePercent > 0 ? '+' : '';
  const title = `${direction} ${alert.cardName} cambió de precio`;
  const body = `${sign}${alert.changePercent.toFixed(1)}% — de $${alert.oldPrice.toFixed(2)} a $${alert.newPrice.toFixed(2)}`;

  try {
    new Notification(title, {
      body,
      icon: alert.cardImage || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: `price-alert-${alert.cardId}`,
    });
  } catch (err) {
    console.warn('Push notification failed:', err);
  }
}

/**
 * Detects REAL price changes by comparing the current TCG API price of each
 * owned card against the last stored baseline. Generates an alert when the
 * change exceeds the threshold (default 5%).
 *
 * Call this when `owned.data` loads in LibraryScreen so alerts are based on
 * actual market data, not random simulation.
 *
 * @param ownedCards  Cards currently in the user's collection (from TCG API).
 * @param threshold   Minimum absolute percent change to trigger an alert (default 5%).
 */
export async function detectRealPriceChanges(
  ownedCards: PokemonCard[],
  threshold = 5,
): Promise<PriceAlert[]> {
  if (typeof localStorage === 'undefined') return [];
  if (!ownedCards || ownedCards.length === 0) return getPriceAlerts();

  const now = Date.now();
  const lastCheckRaw = localStorage.getItem(STORAGE_KEYS.lastCheck);
  const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;

  // Throttle to once per 3 hours to avoid hammering the API.
  const THROTTLE_MS = 3 * 60 * 60 * 1000;
  if (lastCheck && now - lastCheck < THROTTLE_MS) {
    return getPriceAlerts();
  }

  localStorage.setItem(STORAGE_KEYS.lastCheck, String(now));

  const baselines = getBaselines();
  const currentAlerts = getPriceAlerts();
  const newAlerts: PriceAlert[] = [...currentAlerts];

  // Process up to 5 random owned cards per check to avoid excessive API calls.
  const shuffled = [...ownedCards].sort(() => 0.5 - Math.random());
  const targets = shuffled.slice(0, Math.min(5, shuffled.length));

  for (const card of targets) {
    const currentPrice = getEstimatedPrice(card);
    if (!currentPrice) continue;

    const baseline = baselines[card.id];

    if (!baseline) {
      // No baseline yet — save current price as the new baseline, no alert.
      baselines[card.id] = {
        price: currentPrice.value,
        currency: currentPrice.currency,
        recordedAt: new Date().toISOString(),
      };
      continue;
    }

    // Compare only when both are in the same currency (skip cross-currency).
    if (baseline.currency !== currentPrice.currency) continue;

    const oldPrice = baseline.price;
    const newPrice = currentPrice.value;
    if (oldPrice <= 0) continue;

    const changePercent = parseFloat(
      (((newPrice - oldPrice) / oldPrice) * 100).toFixed(1),
    );

    if (Math.abs(changePercent) < threshold) continue;

    // Avoid duplicate alerts for the same card in the last 12h.
    const hasRecent = currentAlerts.some(
      (a) =>
        a.cardId === card.id &&
        now - new Date(a.timestamp).getTime() < 12 * 60 * 60 * 1000,
    );
    if (hasRecent) continue;

    const alert: PriceAlert = {
      id: `alert-${Date.now()}-${card.id.slice(-4)}`,
      cardId: card.id,
      cardName: card.name,
      cardImage: card.images?.small ?? '',
      oldPrice: parseFloat(oldPrice.toFixed(2)),
      newPrice: parseFloat(newPrice.toFixed(2)),
      changePercent,
      timestamp: new Date().toISOString(),
      read: false,
    };

    newAlerts.unshift(alert);

    // Update baseline to the new price after alerting.
    baselines[card.id] = {
      price: newPrice,
      currency: currentPrice.currency,
      recordedAt: new Date().toISOString(),
    };
  }

  // Persist updated baselines.
  try {
    localStorage.setItem(STORAGE_KEYS.baselines, JSON.stringify(baselines));
  } catch {
    /* ignore */
  }

  // Cap alerts at 20.
  const finalAlerts = newAlerts.slice(0, 20);

  localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(finalAlerts));
  updateAppBadge(finalAlerts);
  notifyAlerts();

  // Fire push notifications for significant moves (>20%).
  const prevIds = new Set(currentAlerts.map((a) => a.id));
  for (const alert of finalAlerts) {
    if (!prevIds.has(alert.id) && Math.abs(alert.changePercent) >= 20) {
      sendPriceNotification(alert);
    }
  }

  return finalAlerts;
}

/**
 * Legacy wrapper kept for backward-compatibility.
 * When the user's collection is empty, falls back to demo simulated alerts
 * so the UI always has something to show in the price alerts panel.
 *
 * For users with cards, call `detectRealPriceChanges(owned.data)` directly.
 */
export async function checkAndGeneratePriceAlerts(force = false): Promise<PriceAlert[]> {
  if (typeof localStorage === 'undefined') return [];

  const now = Date.now();
  const lastCheckRaw = localStorage.getItem(STORAGE_KEYS.lastCheck);
  const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;

  const THROTTLE_MS = 3 * 60 * 60 * 1000;
  if (!force && lastCheck && now - lastCheck < THROTTLE_MS) {
    return getPriceAlerts();
  }

  localStorage.setItem(STORAGE_KEYS.lastCheck, String(now));

  const currentAlerts = getPriceAlerts();
  const collectionRaw = localStorage.getItem('carddex.collection.v1');
  let collectionCards: string[] = [];

  if (collectionRaw) {
    try {
      const parsed = JSON.parse(collectionRaw);
      if (parsed?.cards) {
        collectionCards = Object.keys(parsed.cards).filter(
          (id) => parsed.cards[id].owned || parsed.cards[id].wishlist,
        );
      }
    } catch {}
  }

  const newAlerts: PriceAlert[] = [...currentAlerts];

  if (collectionCards.length > 0) {
    // User has cards — fetch real prices and compare against baselines.
    const baselines = getBaselines();
    const shuffled = [...collectionCards].sort(() => 0.5 - Math.random());
    const targets = shuffled.slice(0, Math.min(2, shuffled.length));

    for (const cardId of targets) {
      try {
        const cardData = await getCardById(cardId);
        if (!cardData) continue;

        const currentPrice = getEstimatedPrice(cardData);
        if (!currentPrice) continue;

        const baseline = baselines[cardId];
        if (!baseline) {
          baselines[cardId] = {
            price: currentPrice.value,
            currency: currentPrice.currency,
            recordedAt: new Date().toISOString(),
          };
          continue;
        }

        if (baseline.currency !== currentPrice.currency) continue;

        const oldPrice = baseline.price;
        const newPrice = currentPrice.value;
        if (oldPrice <= 0) continue;

        const changePercent = parseFloat(
          (((newPrice - oldPrice) / oldPrice) * 100).toFixed(1),
        );
        if (Math.abs(changePercent) < 5) continue;

        const hasRecent = currentAlerts.some(
          (a) =>
            a.cardId === cardId &&
            now - new Date(a.timestamp).getTime() < 12 * 60 * 60 * 1000,
        );
        if (hasRecent) continue;

        newAlerts.unshift({
          id: `alert-${Date.now()}-${cardId.slice(-4)}`,
          cardId,
          cardName: cardData.name,
          cardImage: cardData.images?.small ?? '',
          oldPrice: parseFloat(oldPrice.toFixed(2)),
          newPrice: parseFloat(newPrice.toFixed(2)),
          changePercent,
          timestamp: new Date().toISOString(),
          read: false,
        });

        baselines[cardId] = {
          price: newPrice,
          currency: currentPrice.currency,
          recordedAt: new Date().toISOString(),
        };
      } catch (err) {
        console.warn('Failed to check price for cardId:', cardId, err);
      }
    }

    try {
      localStorage.setItem(STORAGE_KEYS.baselines, JSON.stringify(baselines));
    } catch {}
  } else {
    // Empty collection — generate demo alerts so the UI shows something useful.
    const defaultCards = [
      { id: 'sv3-223', name: 'Charizard ex', image: 'https://images.pokemontcg.io/sv3/223.png', basePrice: 65.50 },
      { id: 'sv3pt5-188', name: 'Alakazam ex', image: 'https://images.pokemontcg.io/sv3pt5/188.png', basePrice: 32.20 },
      { id: 'sv3pt5-201', name: 'Mew ex', image: 'https://images.pokemontcg.io/sv3pt5/201.png', basePrice: 110.00 },
      { id: 'sv4-182', name: 'Roaring Moon ex', image: 'https://images.pokemontcg.io/sv4/182.png', basePrice: 58.00 },
    ];

    const shuffledDefaults = [...defaultCards].sort(() => 0.5 - Math.random());
    const selection = shuffledDefaults.slice(0, 2);

    selection.forEach((item) => {
      const changePercent = parseFloat(
        ((Math.random() * 25 + 5) * (Math.random() > 0.45 ? 1 : -1)).toFixed(1),
      );
      const oldPrice = parseFloat(item.basePrice.toFixed(2));
      const newPrice = parseFloat((item.basePrice * (1 + changePercent / 100)).toFixed(2));

      newAlerts.unshift({
        id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        cardId: item.id,
        cardName: item.name,
        cardImage: item.image,
        oldPrice,
        newPrice,
        changePercent,
        timestamp: new Date().toISOString(),
        read: false,
      });
    });
  }

  const finalAlerts = newAlerts.slice(0, 20);
  localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(finalAlerts));
  updateAppBadge(finalAlerts);
  notifyAlerts();

  const prevIds = new Set(currentAlerts.map((a) => a.id));
  for (const alert of finalAlerts) {
    if (!prevIds.has(alert.id) && Math.abs(alert.changePercent) >= 20) {
      sendPriceNotification(alert);
    }
  }

  return finalAlerts;
}

/** Marks all notifications/alerts as read and updates badge status. */
export function markAllAlertsAsRead(): void {
  const alerts = getPriceAlerts();
  const updated = alerts.map((a) => ({ ...a, read: true }));
  localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(updated));
  updateAppBadge(updated);
  notifyAlerts();
}

/** Deletes all notifications/alerts. */
export function clearAllPriceAlerts(): void {
  localStorage.removeItem(STORAGE_KEYS.alerts);
  updateAppBadge([]);
  notifyAlerts();
}
