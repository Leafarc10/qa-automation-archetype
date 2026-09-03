import { Given, Then } from '@cucumber/cucumber';
import type { CustomWorld } from '../../support/world.js';

Given('I open the example application', async function (this: CustomWorld) {
  await this.pages.example.open();
});

Then(
  'I should see a heading that mentions {string}',
  async function (this: CustomWorld, expectedText: string) {
    await this.pages.example.expectHeadingToContain(expectedText);
  }
);

Then('the {string} link should be visible', async function (this: CustomWorld, linkName: string) {
  await this.pages.example.expectLinkVisible(linkName);
});

Then('the main navigation should be visible', async function (this: CustomWorld) {
  await this.pages.example.navigation.expectVisible();
});

Then(
  'the main navigation should include a {string} link',
  async function (this: CustomWorld, linkName: string) {
    await this.pages.example.navigation.expectLinkVisible(linkName);
  }
);
