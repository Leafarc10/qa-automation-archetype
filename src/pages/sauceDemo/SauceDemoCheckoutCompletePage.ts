import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';

/**
 * SauceDemo "Checkout: Complete!" screen. MCP confirmed a confirmation
 * element (`[data-test="complete-header"]`) with the exact text
 * "Thank you for your order!". Locator confirmed by automation-reviewer
 * against the real saucedemo.com application (MCP_OBSERVED).
 */
export class SauceDemoCheckoutCompletePage extends BasePage {
  private readonly confirmationHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.confirmationHeading = page.locator('[data-test="complete-header"]');
  }

  async expectConfirmationMessage(expectedText: string): Promise<void> {
    await this.expectContainsText(this.confirmationHeading, expectedText);
  }
}
