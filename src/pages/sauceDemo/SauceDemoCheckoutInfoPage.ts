import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';

/**
 * SauceDemo "Checkout: Your Information" screen. MCP confirmed textboxes
 * "First Name", "Last Name" and "Zip/Postal Code", a button "Continue", and
 * that a missing postal code keeps the URL on `checkout-step-one.html` while
 * showing an error element (`[data-test="error"]`) with the exact text
 * "Error: Postal Code is required". Locator confirmed by automation-reviewer
 * against the real saucedemo.com application (MCP_OBSERVED).
 */
export class SauceDemoCheckoutInfoPage extends BasePage {
  private readonly firstNameInput: Locator;
  private readonly lastNameInput: Locator;
  private readonly postalCodeInput: Locator;
  private readonly continueButton: Locator;
  private readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.firstNameInput = page.getByRole('textbox', { name: 'First Name' });
    this.lastNameInput = page.getByRole('textbox', { name: 'Last Name' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Zip/Postal Code' });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.errorMessage = page.locator('[data-test="error"]');
  }

  async fillBuyerInfo(firstName: string, lastName: string, postalCode: string): Promise<void> {
    await this.fill(this.firstNameInput, firstName);
    await this.fill(this.lastNameInput, lastName);
    await this.fill(this.postalCodeInput, postalCode);
  }

  async continueToOverview(): Promise<void> {
    await this.click(this.continueButton);
  }

  async expectOnCheckoutInformationForm(): Promise<void> {
    await this.waitForUrlContains('checkout-step-one');
  }

  async expectErrorMessage(expectedText: string): Promise<void> {
    await this.expectContainsText(this.errorMessage, expectedText);
  }
}
