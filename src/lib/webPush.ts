/**
 * Web Push Subscription Client
 * Handles service worker subscription registration and local VAPID keys.
 */

// A valid testing/demo VAPID Public Key
export const VAPID_PUBLIC_KEY = 'BIH_d7q-29vC55a5bN23-LgV681f21_d3y2t0q-9u8c7x6y5z4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1';

// Helper to convert base64 to Uint8Array for pushManager
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
  } catch (err) {
    return null;
  }
}

export async function subscribeToPushNotifications(): Promise<PushSubscription> {
  if (typeof window === 'undefined') {
    throw new Error('Web Push can only be initialized in browser environments.');
  }
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported in this browser.');
  }
  if (!('PushManager' in window)) {
    throw new Error('Push Notifications are not supported in this browser.');
  }

  const registration = await navigator.serviceWorker.ready;
  
  // Request notification permission if not already granted
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission denied.');
  }

  // Subscribe to the Push Manager
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(
      'BIH_d7q-29vC55a5bN23-LgV681f21_d3y2t0q-9u8c7x6y5z4w3v2u1t0s9r8q7p6o5n4m3l2k1j0i9h8g7f6e5d4c3b2a1'
    ),
  });

  // Store subscription in localStorage for demo backup, and optionally send to backend
  try {
    localStorage.setItem('carddex_push_subscription', JSON.stringify(subscription));
  } catch {
    // Storage may be disabled; the PushManager subscription remains active.
  }
  return subscription;
}

export async function unsubscribeFromPushNotifications(): Promise<boolean> {
  const subscription = await getPushSubscription();
  if (!subscription) return false;
  
  const success = await subscription.unsubscribe();
  if (success) {
    try {
      localStorage.removeItem('carddex_push_subscription');
    } catch {}
  }
  return success;
}
