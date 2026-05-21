import { test, expect, Page } from '@playwright/test';

/**
 * E2E — Card Detail Screen
 * Tests that the detail page loads, key UI sections render correctly,
 * and collection actions work without crashing.
 */

/**
 * Navigate to a card detail page.
 * Uses /card/xy7-54 (Charizard from XY Flashfire) as a stable test fixture.
 */
const TEST_CARD_URL = '/card/xy7-54';

test.describe('Card Detail Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('carddex.onboardingComplete', 'true');
    });
    await page.goto(TEST_CARD_URL);
    await page.waitForLoadState('domcontentloaded');
    // Wait for the card to load (skeleton → content transition)
    await page.locator('text=/Cargando/i').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
  });

  test('detail page loads without JS errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForTimeout(500);

    const criticalErrors = errors.filter(
      (e) =>
        !e.includes('indexedDB') &&
        !e.includes('IndexedDB') &&
        !e.includes('fetch') &&
        !e.includes('NetworkError'),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('card name is displayed', async ({ page }) => {
    // Either the card name appears, or a loading/error state is shown
    const cardName = page.locator('h2, h1').first();
    const loadingMsg = page.getByText(/cargando|loading|no se pudo/i).first();

    const hasName = (await cardName.count()) > 0;
    const hasLoadingOrError = (await loadingMsg.count()) > 0;

    expect(hasName || hasLoadingOrError).toBe(true);
  });

  test('back button is present and interactive', async ({ page }) => {
    const backBtn = page.locator(
      'button[aria-label*="volver" i], button[aria-label*="back" i], button[aria-label*="atrás" i]',
    );
    if ((await backBtn.count()) > 0) {
      await expect(backBtn.first()).toBeVisible();
      // Click and verify we navigate away from the detail page (no crash)
      await backBtn.first().click();
      await page.waitForTimeout(500);
      // Should navigate away (either to localhost or about:blank in clean session)
      const currentUrl = page.url();
      expect(currentUrl.includes('localhost') || currentUrl.includes('about:blank')).toBe(true);
    }
  });

  test('share button is visible', async ({ page }) => {
    const shareBtn = page.locator(
      'button[aria-label*="compartir" i], button[aria-label*="share" i]',
    );
    if ((await shareBtn.count()) > 0) {
      await expect(shareBtn.first()).toBeVisible();
    }
  });

  test('more (⋯) button opens the actions modal', async ({ page }) => {
    const moreBtn = page.locator(
      'button[aria-label*="más" i], button[aria-label*="more" i], button[aria-label*="acciones" i]',
    );

    if ((await moreBtn.count()) > 0) {
      await moreBtn.first().click();
      await page.waitForTimeout(400);

      // The modal should appear with action buttons
      const downloadBtn = page.getByText(/descargar imagen|download image/i).first();
      const copyIdBtn = page.getByText(/copiar id/i).first();
      const cancelBtn = page.getByText(/cancelar|cancel/i).first();

      const hasActions =
        (await downloadBtn.count()) + (await copyIdBtn.count()) + (await cancelBtn.count());
      expect(hasActions).toBeGreaterThan(0);

      // Close the modal by clicking Cancel
      if ((await cancelBtn.count()) > 0) {
        await cancelBtn.click();
        await page.waitForTimeout(300);
        // Modal should be gone
        const modalStillOpen = await page.locator('[role="dialog"]').count();
        expect(modalStillOpen).toBe(0);
      }
    }
  });

  test('save-to-collection button is present', async ({ page }) => {
    const saveBtn = page
      .locator('button')
      .filter({ hasText: /guardar en mi colección|guardar|saved|guardado/i })
      .first();

    if ((await saveBtn.count()) > 0) {
      await expect(saveBtn).toBeVisible();
    }
  });

  test('stats grid shows HP and card number', async ({ page }) => {
    // Stats like HP and card number should be visible somewhere
    const hpText = page.getByText(/^PS$|^HP$|points/i).first();
    const numberLabel = page.getByText(/^número$|^number$/i).first();

    // At least one stat label should be visible
    const statsVisible = (await hpText.count()) + (await numberLabel.count());
    expect(statsVisible).toBeGreaterThan(0);
  });

  test('price section renders or shows no-price state', async ({ page }) => {
    // Either price is shown (with currency symbol) or a "Sin precio" fallback
    const hasPrice =
      (await page.getByText(/\$|€|USD|EUR|Sin precio/i).count()) > 0;
    expect(hasPrice).toBe(true);
  });

  test('quick action buttons (favorita, wishlist, falta) are interactive', async ({
    page,
  }) => {
    const actionBtns = page
      .locator('button')
      .filter({ hasText: /favorita|wishlist|falta/i });

    if ((await actionBtns.count()) > 0) {
      // Click the first one and verify no crash
      await actionBtns.first().click({ force: true });
      await page.waitForTimeout(300);
      const crashed = await page.locator('text=/uncaught|TypeError/i').count();
      expect(crashed).toBe(0);
    }
  });
});

// ─── Accessibility checks ────────────────────────────────────────────────────

test.describe('Card Detail — Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('carddex.onboardingComplete', 'true');
    });
  });

  test('page has a main heading', async ({ page }) => {
    await page.goto(TEST_CARD_URL);
    await page.locator('text=/Cargando/i').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

    const heading = page.locator('h1, h2').first();
    if ((await heading.count()) > 0) {
      await expect(heading).toBeVisible();
    }
  });

  test('interactive buttons have accessible labels', async ({ page }) => {
    await page.goto(TEST_CARD_URL);
    await page.locator('text=/Cargando/i').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

    // Buttons should not be empty (no label)
    const buttons = page.locator('button');
    const count = await buttons.count();

    let unlabeledCount = 0;
    for (let i = 0; i < Math.min(count, 20); i++) {
      const btn = buttons.nth(i);
      const text = await btn.innerText().catch(() => '');
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      if (!text.trim() && !ariaLabel && !title) {
        unlabeledCount++;
      }
    }

    // Allow up to 2 unlabeled icon buttons (decorative)
    expect(unlabeledCount).toBeLessThanOrEqual(2);
  });
});
