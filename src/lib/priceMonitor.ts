import { getCardById, searchCards } from './pokemonTcgApi';
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

const STORAGE_KEYS = {
  alerts: 'carddex.price_alerts.v1',
  lastCheck: 'carddex.price_alerts.last_check',
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

/**
 * Returns all saved price alerts.
 */
export function getPriceAlerts(): PriceAlert[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.alerts);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
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
 * Should be called from a user gesture (e.g., button click in ProfileScreen).
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof Notification === 'undefined') return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.requestPermission();
}

/**
 * Fires a native PWA push notification for a significant price change.
 * Only runs when Notification permission is already granted.
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
 * Generates simulated price fluctuations for collection or wishlist items.
 * If collection is empty, generates mockup alerts for iconic cards.
 */
export async function checkAndGeneratePriceAlerts(force = false): Promise<PriceAlert[]> {
  if (typeof localStorage === 'undefined') return [];

  const now = Date.now();
  const lastCheckRaw = localStorage.getItem(STORAGE_KEYS.lastCheck);
  const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;
  
  // Throttle alerts generation to at most once every 3 hours, unless forced.
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
          (id) => parsed.cards[id].owned || parsed.cards[id].wishlist
        );
      }
    } catch {}
  }

  // Pre-selected default cards to simulate fluctuations if user's collection is empty
  const defaultCards = [
    { id: 'sv3-223', name: 'Charizard ex', image: 'https://images.pokemontcg.io/sv3/223.png', basePrice: 65.50 },
    { id: 'sv3pt5-188', name: 'Alakazam ex', image: 'https://images.pokemontcg.io/sv3pt5/188.png', basePrice: 32.20 },
    { id: 'sv3pt5-201', name: 'Mew ex', image: 'https://images.pokemontcg.io/sv3pt5/201.png', basePrice: 110.00 },
    { id: 'sv4-182', name: 'Roaring Moon ex', image: 'https://images.pokemontcg.io/sv4/182.png', basePrice: 58.00 }
  ];

  const newAlerts: PriceAlert[] = [...currentAlerts];

  if (collectionCards.length > 0) {
    // Pick 1 to 2 random cards from user's collection/wishlist to trigger fluctuations
    const shuffled = [...collectionCards].sort(() => 0.5 - Math.random());
    const targets = shuffled.slice(0, Math.min(2, shuffled.length));

    for (const cardId of targets) {
      try {
        const cardData = await getCardById(cardId);
        if (cardData) {
          const basePrice = cardData.tcgplayer?.prices?.holofoil?.market ?? 
                            cardData.cardmarket?.prices?.averageSellPrice ?? 
                            15.00;
          
          const changePercent = parseFloat(((Math.random() * 20 + 5) * (Math.random() > 0.4 ? 1 : -1)).toFixed(1));
          const oldPrice = parseFloat((basePrice * (1 - changePercent / 100)).toFixed(2));
          const newPrice = parseFloat(basePrice.toFixed(2));
          
          // Avoid duplicate alerts for the exact same card in the last 12 hours
          const hasRecent = currentAlerts.some(
            (a) => a.cardId === cardId && (now - new Date(a.timestamp).getTime()) < 12 * 60 * 60 * 1000
          );

          if (!hasRecent) {
            newAlerts.unshift({
              id: `alert-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              cardId,
              cardName: cardData.name,
              cardImage: cardData.images?.small ?? '',
              oldPrice,
              newPrice,
              changePercent,
              timestamp: new Date().toISOString(),
              read: false,
            });
          }
        }
      } catch (err) {
        console.warn('Failed to generate alert for cardId:', cardId, err);
      }
    }
  } else {
    // Generate simulated alerts using default iconic cards
    const shuffledDefaults = [...defaultCards].sort(() => 0.5 - Math.random());
    const selection = shuffledDefaults.slice(0, 2);

    selection.forEach((item) => {
      const changePercent = parseFloat(((Math.random() * 25 + 5) * (Math.random() > 0.45 ? 1 : -1)).toFixed(1));
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

  // Cap at 20 alerts maximum
  const finalAlerts = newAlerts.slice(0, 20);

  localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(finalAlerts));
  updateAppBadge(finalAlerts);
  notifyAlerts();

  // Fire push notifications for new alerts with significant price moves (>20%)
  const prevIds = new Set(currentAlerts.map((a) => a.id));
  for (const alert of finalAlerts) {
    if (!prevIds.has(alert.id) && Math.abs(alert.changePercent) >= 20) {
      sendPriceNotification(alert);
    }
  }

  return finalAlerts;
}

/**
 * Marks all notifications/alerts as read and updates badge status.
 */
export function markAllAlertsAsRead(): void {
  const alerts = getPriceAlerts();
  const updated = alerts.map((a) => ({ ...a, read: true }));
  localStorage.setItem(STORAGE_KEYS.alerts, JSON.stringify(updated));
  updateAppBadge(updated);
  notifyAlerts();
}

/**
 * Deletes all notifications/alerts.
 */
export function clearAllPriceAlerts(): void {
  localStorage.removeItem(STORAGE_KEYS.alerts);
  updateAppBadge([]);
  notifyAlerts();
}
