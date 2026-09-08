import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';

/**
 * SauceDemo "Checkout: Overview" screen. MCP confirmed the listed product is
 * a `link` with its accessible name, a `button` named "Finish", and that the
 * price summary total (`data-test="total-label"`) has no accessible
 * role/name of its own. Only structural presence (visible, containing the
 * "Total" prefix) is validated here — actual amounts are intentionally not
 * asserted.
 */
export class SauceDemoCheckoutOverviewPage extends BasePage {
  private readonly totalLabel: Locator;
  private readonly finishButton: Locator;

  constructor(page: Page) {
    super(page);
    this.totalLabel = page.locator('[data-test="total-label"]');
    this.finishButton = page.getByRole('button', { name: 'Finish' });
  }

  async expectProductVisible(productName: string): Promise<void> {
    await this.waitForVisible(this.productLink(productName));
  }

  async expectPriceSummaryPresent(): Promise<void> {
    await this.expectContainsText(this.totalLabel, 'Total');
  }

  async finish(): Promise<void> {
    await this.click(this.finishButton);
  }

  private productLink(productName: string): Locator {
    return this.page.getByRole('link', { name: productName, exact: true });
  }
}
