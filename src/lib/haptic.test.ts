import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { triggerHaptic } from './haptic';

describe('haptic utility', () => {
  const originalVibrate = typeof navigator !== 'undefined' ? navigator.vibrate : undefined;

  beforeEach(() => {
    // Mock navigator.vibrate
    if (typeof global !== 'undefined') {
      const nav = (global as any).navigator || {};
      nav.vibrate = vi.fn().mockReturnValue(true);
      Object.defineProperty(global, 'navigator', {
        value: nav,
        configurable: true,
        writable: true,
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (typeof global !== 'undefined' && originalVibrate) {
      (global as any).navigator.vibrate = originalVibrate;
    }
  });

  it('should trigger light vibration pattern', () => {
    triggerHaptic('light');
    expect(navigator.vibrate).toHaveBeenCalledWith([15]);
  });

  it('should trigger medium vibration pattern', () => {
    triggerHaptic('medium');
    expect(navigator.vibrate).toHaveBeenCalledWith([30]);
  });

  it('should trigger heavy vibration pattern', () => {
    triggerHaptic('heavy');
    expect(navigator.vibrate).toHaveBeenCalledWith([60]);
  });

  it('should trigger success vibration pattern', () => {
    triggerHaptic('success');
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 40, 30]);
  });

  it('should trigger warning vibration pattern', () => {
    triggerHaptic('warning');
    expect(navigator.vibrate).toHaveBeenCalledWith([80, 50, 80]);
  });

  it('should trigger error vibration pattern', () => {
    triggerHaptic('error');
    expect(navigator.vibrate).toHaveBeenCalledWith([120, 80, 120]);
  });
});
