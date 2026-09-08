import { Given, Then, When } from '@cucumber/cucumber';
import type { CustomWorld } from '../../../support/world.js';

Given(
  'I log in to SauceDemo as {string} with password {string}',
  async function (this: CustomWorld, username: string, password: string) {
    await this.pages.sauceDemoLogin.open();
    await this.pages.sauceDemoLogin.login(username, password);
  }
);

When('I add {string} to the cart', async function (this: CustomWorld, productName: string) {
  await this.pages.sauceDemoInventory.addProductToCart(productName);
});

Then('the cart badge should show {string}', async function (this: CustomWorld, count: string) {
  await this.pages.sauceDemoInventory.expectCartBadgeCount(count);
});

When('I open the cart', async function (this: CustomWorld) {
  await this.pages.sauceDemoInventory.openCart();
});

Then('I should see {string} in the cart', async function (this: CustomWorld, productName: string) {
  await this.pages.sauceDemoCart.expectProductVisible(productName);
});

When('I proceed to checkout', async function (this: CustomWorld) {
  await this.pages.sauceDemoCart.proceedToCheckout();
});

When(
  'I fill in the checkout information with first name {string}, last name {string} and postal code {string}',
  async function (this: CustomWorld, firstName: string, lastName: string, postalCode: string) {
    await this.pages.sauceDemoCheckoutInfo.fillBuyerInfo(firstName, lastName, postalCode);
  }
);

When('I continue to the checkout overview', async function (this: CustomWorld) {
  await this.pages.sauceDemoCheckoutInfo.continueToOverview();
});

Then(
  'I should see {string} in the checkout overview',
  async function (this: CustomWorld, productName: string) {
    await this.pages.sauceDemoCheckoutOverview.expectProductVisible(productName);
  }
);

Then('the price summary should be present', async function (this: CustomWorld) {
  await this.pages.sauceDemoCheckoutOverview.expectPriceSummaryPresent();
});

When('I finish the checkout', async function (this: CustomWorld) {
  await this.pages.sauceDemoCheckoutOverview.finish();
});

Then(
  'I should see the order confirmation message {string}',
  async function (this: CustomWorld, message: string) {
    await this.pages.sauceDemoCheckoutComplete.expectConfirmationMessage(message);
  }
);

Then('I should remain on the checkout information form', async function (this: CustomWorld) {
  await this.pages.sauceDemoCheckoutInfo.expectOnCheckoutInformationForm();
});

Then(
  'I should see the checkout information error {string}',
  async function (this: CustomWorld, message: string) {
    await this.pages.sauceDemoCheckoutInfo.expectErrorMessage(message);
  }
);
