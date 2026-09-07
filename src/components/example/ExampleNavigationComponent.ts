import type { Locator, Page } from '@playwright/test';
import { BaseComponent } from '../base/BaseComponent.js';

/**
 * Encapsulates the site's main navigation bar (present on every page).
 * Composed by ExamplePage; never referenced directly from Steps/Features.
 */
export class ExampleNavigationComponent extends BaseComponent {
  constructor(page: Page) {
    super(page, page.getByRole('navigation', { name: 'Main' }));
  }

  async expectVisible(): Promise<void> {
    await this.waitForVisible(this.root);
  }

  async expectLinkVisible(linkName: string): Promise<void> {
    await this.waitForVisible(this.linkByName(linkName));
  }

  async clickLink(linkName: string): Promise<void> {
    await this.click(this.linkByName(linkName));
  }

  private linkByName(linkName: string): Locator {
    return this.root.getByRole('link', { name: linkName, exact: true });
  }
}
