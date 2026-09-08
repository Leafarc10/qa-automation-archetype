import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';

/**
 * SauceDemo inventory ("Products") screen. MCP confirmed each product card
 * has `data-test="inventory-item"` (no accessible role/name of its own) and
 * contains a `link` with the product's accessible name plus a `button` whose
 * accessible name is "Add to cart" (or "Remove" once added). Scoping the
 * button lookup to the card that contains the matching product link avoids
 * ambiguity between products. The cart badge/link (`data-test`
 * "shopping-cart-badge"/"shopping-cart-link") has no accessible role/name at
 * all when the cart is empty, so it is targeted via `data-test`.
 */
export class SauceDemoInventoryPage extends BasePage {
  private readonly cartLink: Locator;
  private readonly cartBadge: Locator;

  constructor(page: Page) {
    super(page);
    this.cartLink = page.locator('[data-test="shopping-cart-link"]');
    this.cartBadge = page.locator('[data-test="shopping-cart-badge"]');
  }

  async addProductToCart(productName: string): Promise<void> {
    await this.click(this.addToCartButton(productName));
  }

  async expectCartBadgeCount(count: string): Promise<void> {
    await this.expectText(this.cartBadge, count);
  }

  async openCart(): Promise<void> {
    await this.click(this.cartLink);
  }

  private productCard(productName: string): Locator {
    return this.page
      .locator('[data-test="inventory-item"]')
      .filter({ has: this.page.getByRole('link', { name: productName, exact: true }) });
  }

  private addToCartButton(productName: string): Locator {
    return this.productCard(productName).getByRole('button', { name: 'Add to cart' });
  }
}
