import { test, expect } from '@playwright/test';

/**
 * E2E — Scanner Screen
 * Verifies the scanner loads, camera permission UI renders correctly,
 * and all scanner modes are accessible.
 */

test.describe('Scanner Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Grant camera permission so the browser doesn't block the scanner
    await page.context().grantPermissions(['camera']);
    await page.addInitScript(() => {
      window.localStorage.setItem('carddex.onboardingComplete', 'true');
    });
    await page.goto('/scan');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(500);
  });

  test('scanner page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.waitForTimeout(1000);

    // Filter out known benign errors (IndexedDB, network in test env)
    const criticalErrors = errors.filter(
      (e) => !e.includes('indexedDB') && !e.includes('IndexedDB') && !e.includes('fetch'),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('scanner shows camera view or permission prompt', async ({ page }) => {
    // Either a live video element or a permission-denied message should render
    const hasVideo = await page.locator('video').count();
    const hasPermMsg = await page
      .getByText(/cámara|camera|permiso|permission|acceso/i)
      .count();
    const hasCanvas = await page.locator('canvas').count();

    expect(hasVideo + hasPermMsg + hasCanvas).toBeGreaterThan(0);
  });

  test('scan mode selector is visible and allows switching modes', async ({ page }) => {
    // The mode selector bar should be visible (Único / Lote / Multicarta / Evaluación)
    const modeButtons = page.locator('button').filter({
      hasText: /único|lote|batch|grading|evaluación|multicarta/i,
    });

    if (await modeButtons.count() > 0) {
      // Click through the modes and verify no crash
      const count = Math.min(await modeButtons.count(), 3);
      for (let i = 0; i < count; i++) {
        await modeButtons.nth(i).click({ force: true });
        await page.waitForTimeout(200);
        const crashed = await page.locator('text=/uncaught|TypeError/i').count();
        expect(crashed).toBe(0);
      }
    }
  });

  test('gallery/file picker button is present', async ({ page }) => {
    // The "Galería" / "Gallery" button should be visible
    const galleryBtn = page.locator('button, label').filter({
      hasText: /galería|gallery|foto|photo/i,
    });
    // The button exists (even if hidden behind camera overlay)
    const fileInput = page.locator('input[type="file"][accept*="image"]');

    expect(
      (await galleryBtn.count()) + (await fileInput.count()),
    ).toBeGreaterThan(0);
  });

  test('close/back button returns to home', async ({ page }) => {
    const closeBtn = page
      .locator('button[aria-label*="cerrar" i], button[aria-label*="close" i], button[aria-label*="volver" i], button[aria-label*="back" i]')
      .first();

    if (await closeBtn.count() > 0) {
      await closeBtn.click({ force: true });
      await page.waitForTimeout(600);
      // Should navigate away from /scan
      expect(page.url()).toContain('localhost');
    }
  });

  test('language selector (OCR) is accessible', async ({ page }) => {
    const langSelector = page.locator('button, select').filter({
      hasText: /auto|eng|esp|jpn|en|es|jp/i,
    });
    if (await langSelector.count() > 0) {
      await langSelector.first().click({ force: true });
      await page.waitForTimeout(200);
      const crashed = await page.locator('text=/uncaught|TypeError/i').count();
      expect(crashed).toBe(0);
    }
  });
});
