/**
 * Utility for triggering haptic feedback via the HTML5 vibration API.
 */

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

const HAPTIC_PATTERNS: Record<HapticType, number[]> = {
  light: [15],
  medium: [30],
  heavy: [60],
  success: [30, 40, 30],
  warning: [80, 50, 80],
  error: [120, 80, 120],
};

/**
 * Triggers vibration feedback on supported devices.
 * Uses navigator.vibrate if available.
 */
export function triggerHaptic(type: HapticType): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(HAPTIC_PATTERNS[type]);
    } catch (err) {
      console.warn('Haptic feedback failed:', err);
    }
  }
}
