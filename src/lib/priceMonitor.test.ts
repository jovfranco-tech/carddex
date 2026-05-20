import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPriceAlerts,
  markAllAlertsAsRead,
  clearAllPriceAlerts,
  subscribePriceAlerts,
  checkAndGeneratePriceAlerts,
  updateAppBadge,
} from './priceMonitor';

describe('priceMonitor utility', () => {
  beforeEach(() => {
    // Mock localStorage
    let store: Record<string, string> = {};
    const mockLocalStorage = {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
    Object.defineProperty(global, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('should return empty array when no alerts are stored', () => {
    const alerts = getPriceAlerts();
    expect(alerts).toEqual([]);
  });

  it('should notify subscriber when alerts change', () => {
    const callback = vi.fn();
    const unsubscribe = subscribePriceAlerts(callback);

    clearAllPriceAlerts();
    expect(callback).toHaveBeenCalled();

    unsubscribe();
  });

  it('should check alerts and simulate correctly', async () => {
    const alerts = await checkAndGeneratePriceAlerts(true);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].id).toContain('alert-');
    expect(alerts[0].read).toBe(false);

    const saved = getPriceAlerts();
    expect(saved.length).toEqual(alerts.length);
  });

  it('should mark all alerts as read', async () => {
    await checkAndGeneratePriceAlerts(true);
    const unread = getPriceAlerts();
    expect(unread.some((a) => !a.read)).toBe(true);

    markAllAlertsAsRead();
    const read = getPriceAlerts();
    expect(read.every((a) => a.read)).toBe(true);
  });

  it('should clear all price alerts', async () => {
    await checkAndGeneratePriceAlerts(true);
    expect(getPriceAlerts().length).toBeGreaterThan(0);

    clearAllPriceAlerts();
    expect(getPriceAlerts()).toEqual([]);
  });

  it('should handle AppBadge correctly without throwing errors', () => {
    const mockSetBadge = vi.fn().mockResolvedValue(undefined);
    const mockClearBadge = vi.fn().mockResolvedValue(undefined);

    const originalNavigator = global.navigator;
    Object.defineProperty(global, 'navigator', {
      value: {
        setAppBadge: mockSetBadge,
        clearAppBadge: mockClearBadge,
      },
      writable: true,
      configurable: true,
    });

    updateAppBadge([
      {
        id: '1',
        cardId: 'sv3-223',
        cardName: 'Charizard ex',
        cardImage: '',
        oldPrice: 10,
        newPrice: 12,
        changePercent: 20,
        timestamp: new Date().toISOString(),
        read: false,
      },
    ]);

    expect(mockSetBadge).toHaveBeenCalledWith(1);

    updateAppBadge([
      {
        id: '1',
        cardId: 'sv3-223',
        cardName: 'Charizard ex',
        cardImage: '',
        oldPrice: 10,
        newPrice: 12,
        changePercent: 20,
        timestamp: new Date().toISOString(),
        read: true,
      },
    ]);

    expect(mockClearBadge).toHaveBeenCalled();

    // Restore
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });
});
