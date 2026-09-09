import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';

/**
 * SauceDemo "Your Cart" screen. MCP confirmed the listed product is a `link`
 * with its accessible name, and a `button` named "Checkout".
 */
export class SauceDemoCartPage extends BasePage {
  private readonly checkoutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.checkoutButton = page.getByRole('button', { name: 'Checkout' });
  }

  async expectProductVisible(productName: string): Promise<void> {
    await this.waitForVisible(this.productLink(productName));
  }

  async proceedToCheckout(): Promise<void> {
    await this.click(this.checkoutButton);
  }

  private productLink(productName: string): Locator {
    return this.page.getByRole('link', { name: productName, exact: true });
  }
}
