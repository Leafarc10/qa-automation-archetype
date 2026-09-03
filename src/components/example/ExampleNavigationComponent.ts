import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../../pages/base/BasePage.js';

/**
 * Encapsulates the site's main navigation bar (present on every page).
 * Composed by ExamplePage; never referenced directly from Steps/Features.
 */
export class ExampleNavigationComponent extends BasePage {
  private readonly nav: Locator;

  constructor(page: Page) {
    super(page);
    this.nav = page.getByRole('navigation', { name: 'Main' });
  }

  async expectVisible(): Promise<void> {
    await this.waitForVisible(this.nav);
  }

  async expectLinkVisible(linkName: string): Promise<void> {
    await this.waitForVisible(this.nav.getByRole('link', { name: linkName, exact: true }));
  }
}
