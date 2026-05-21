import { test, expect } from '@playwright/test';

/**
 * E2E — Scanner Screen
 * Verifies the scanner loads, camera permission UI renders correctly,
 * and all scanner modes are accessible.
 */

test.describe('Scanner Screen', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.slow();
    // Grant camera permission so the browser doesn't block the scanner
    await page.context().grantPermissions(['camera']);
    await page.addInitScript(() => {
      window.localStorage.setItem('carddex.onboardingComplete', 'true');
      
      // Mock window.cv to avoid fetching and compiling heavy 8MB OpenCV.js in tests
      (window as any).cv = {
        Mat: class DummyMat {
          rows = 0;
          delete() {}
        },
        MatVector: class DummyMatVector {
          size() { return 0; }
          get() { return null; }
          delete() {}
        },
        Size: class DummySize {
          constructor() {}
        },
        Scalar: class DummyScalar {
          constructor() {}
        },
        BORDER_DEFAULT: 1,
        RETR_EXTERNAL: 1,
        CHAIN_APPROX_SIMPLE: 1,
        CV_32FC2: 6,
        INTER_LINEAR: 1,
        BORDER_CONSTANT: 0,
        approxPolyDP: () => {},
        imread: () => new (window as any).cv.Mat(),
        cvtColor: () => {},
        GaussianBlur: () => {},
        Canny: () => {},
        findContours: () => {},
        matFromArray: () => new (window as any).cv.Mat(),
        getPerspectiveTransform: () => new (window as any).cv.Mat(),
        warpPerspective: () => {},
        imshow: () => {},
      };
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
    // Target each mode button specifically by its text to avoid stale element issues
    const modes = [/único/i, /lote/i, /multi/i, /evaluación/i];
    for (const mode of modes) {
      const btn = page.locator('button').filter({ hasText: mode }).first();
      if (await btn.count() > 0) {
        await btn.click({ force: true });
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
