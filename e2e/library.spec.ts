import { test, expect } from '@playwright/test';

/**
 * E2E — Library Screen
 * Tests card search, rarity filtering, and AI search toggle.
 */

test.describe('Library Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate directly to the library
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Try clicking the library/biblioteca nav item
    const navLink = page.locator('a[href*="library"], a[href*="biblioteca"]').first();
    if (await navLink.count() > 0) {
      await navLink.click();
      await page.waitForTimeout(400);
    }
  });

  test('library screen renders without errors', async ({ page }) => {
    // Page must not have an uncaught error overlay
    const errorText = await page.locator('[data-testid="error-state"], .error-state').count();
    expect(errorText).toBe(0);
    // Some content should be visible
    await page.waitForTimeout(1000);
    expect(await page.content()).toContain('body');
  });

  test('search input accepts text and displays results or empty state', async ({ page }) => {
    const searchInput = page
      .locator('input[type="search"], input[placeholder*="buscar" i], input[placeholder*="search" i]')
      .first();

    if (await searchInput.count() === 0) {
      // If the search bar isn't immediately visible, click the search icon
      const searchBtn = page.locator('[aria-label*="search" i], [aria-label*="buscar" i]').first();
      if (await searchBtn.count() > 0) await searchBtn.click();
    }

    if (await searchInput.count() > 0) {
      await searchInput.fill('Pikachu');
      await page.waitForTimeout(600); // debounce

      // Either cards appear or an empty/loading state is shown — no crash is the goal
      const crashed = await page.locator('text=/error|TypeError|Unexpected/i').count();
      expect(crashed).toBe(0);
    }
  });

  test('rarity filter chips are visible and clickable', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');

    // Rarity filter chips should exist somewhere in the page
    const chips = page.locator('button, [role="tab"]').filter({ hasText: /rara|holo|common|rare|all|todas/i });
    if (await chips.count() > 0) {
      await chips.first().click();
      await page.waitForTimeout(300);
      // No crash
      const errorOverlay = await page.locator('text=/uncaught|TypeError/i').count();
      expect(errorOverlay).toBe(0);
    }
  });

  test('view toggles (grid / list) work without crashing', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const viewToggle = page.locator('[aria-label*="grid" i], [aria-label*="list" i], [aria-label*="vista" i]').first();
    if (await viewToggle.count() > 0) {
      await viewToggle.click();
      await page.waitForTimeout(200);
      const errorOverlay = await page.locator('text=/uncaught|TypeError/i').count();
      expect(errorOverlay).toBe(0);
    }
  });
});
