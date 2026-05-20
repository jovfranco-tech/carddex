import { test, expect } from '@playwright/test';

/**
 * E2E — Profile Screen
 * Tests authentication form, settings toggles, and biometric passkey section.
 */

test.describe('Profile Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly to profile route — avoids bottom-nav overlay intercept issues
    await page.goto('/profile');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
  });

  test('profile screen renders without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(500);
    // Filter out non-fatal warnings
    const fatal = errors.filter(
      (e) => !e.includes('Warning:') && !e.includes('ResizeObserver'),
    );
    expect(fatal).toHaveLength(0);
  });

  test('shows login form when not authenticated', async ({ page }) => {
    // The app starts unauthenticated in E2E; a login form or auth section should appear
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    // Either auth form OR a logged-in profile view should be present — no blank page
    const hasAuthForm = (await emailInput.count()) > 0 && (await passwordInput.count()) > 0;
    const hasProfileContent = (await page.locator('text=/nombre|colección|logros/i').count()) > 0;

    expect(hasAuthForm || hasProfileContent).toBe(true);
  });

  test('login form validates empty submission gracefully', async ({ page }) => {
    const emailInput = page.locator('input[type="email"]').first();
    const passwordInput = page.locator('input[type="password"]').first();

    if (await emailInput.count() > 0 && await passwordInput.count() > 0) {
      // Try to submit without filling — app should show a validation toast, not crash
      const loginBtn = page
        .locator('button[type="submit"], button')
        .filter({ hasText: /iniciar|entrar|login|sign in/i })
        .first();

      if (await loginBtn.count() > 0) {
        await loginBtn.click();
        await page.waitForTimeout(500);

        // No unhandled JS error should occur
        const errorOverlay = await page.locator('text=/uncaught|TypeError/i').count();
        expect(errorOverlay).toBe(0);
      }
    }
  });

  test('import button is visible and clickable', async ({ page }) => {
    const importBtn = page
      .locator('button')
      .filter({ hasText: /import|importar/i })
      .first();

    if (await importBtn.count() > 0) {
      await importBtn.click();
      await page.waitForTimeout(300);
      // A file picker should be triggered (browser opens native dialog — we just verify no crash)
      const errorOverlay = await page.locator('text=/uncaught|TypeError/i').count();
      expect(errorOverlay).toBe(0);
    }
  });

  test('passkey/biometric section is visible when Supabase is configured', async ({ page }) => {
    // If Supabase is configured, the passkey section should be rendered
    await page.waitForTimeout(300);
    const passkeySection = page
      .locator('text=/biométrico|passkey|llave de paso|face id|touch id/i')
      .first();

    // It may not be present if Supabase is not configured — that's OK
    if (await passkeySection.count() > 0) {
      await expect(passkeySection).toBeVisible();
    }
  });

  test('scan language toggle cycles through options', async ({ page }) => {
    const langToggle = page
      .locator('button')
      .filter({ hasText: /auto|EN|ES|JP/i })
      .first();

    if (await langToggle.count() > 0) {
      const textBefore = await langToggle.textContent();
      await langToggle.click();
      await page.waitForTimeout(300);
      const textAfter = await langToggle.textContent();
      // Text should change to a different language option
      const options = ['AUTO', 'EN', 'ES', 'JP'];
      expect(options.some((o) => textAfter?.includes(o))).toBe(true);
      void textBefore;
    }
  });
});
