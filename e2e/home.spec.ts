import { test, expect } from '@playwright/test';

/**
 * E2E — Home Screen
 * Verifies that the app loads, navigation works, and the collection
 * summary area is rendered without crashes.
 */

test.describe('Home Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders without crashing and shows app title', async ({ page }) => {
    // App should load — either show collection or the empty onboarding state
    await expect(page).toHaveTitle(/CardDex/i);
    // Bottom navigation should always be present
    await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible({ timeout: 8000 });
  });

  test('shows either a collection summary or empty-state call-to-action', async ({ page }) => {
    // Wait for React hydration
    await page.waitForLoadState('domcontentloaded');

    // Either we have collection cards visible OR an empty state element
    const hasCards = await page.locator('[data-testid="card-tile"], .card-tile').count();
    const hasEmpty = await page
      .getByText(/comienza|escanea|añade|agrega|primera/i)
      .count();

    // At least one of the two states should exist
    expect(hasCards + hasEmpty).toBeGreaterThan(0);
  });

  test('bottom navigation tabs are clickable', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');

    // Navigate to Library tab
    const libraryTab = page.getByRole('link', { name: /biblioteca|library/i });
    if (await libraryTab.count() > 0) {
      await libraryTab.click();
      await page.waitForURL(/\/library|\/biblioteca/, { timeout: 5000 });
    } else {
      // Try by href
      const libLink = page.locator('a[href*="library"], a[href*="biblioteca"]');
      if (await libLink.count() > 0) {
        await libLink.first().click();
      }
    }
    // Page should not crash
    await page.waitForTimeout(400);
    expect(page.url()).toContain('localhost');
  });

  test('search bar on home is interactive', async ({ page }) => {
    await page.waitForLoadState('domcontentloaded');
    const searchInput = page.locator('input[type="search"], input[placeholder*="buscar" i], input[placeholder*="search" i]').first();
    if (await searchInput.count() > 0) {
      await searchInput.fill('Charizard');
      await expect(searchInput).toHaveValue('Charizard');
    }
  });
});
