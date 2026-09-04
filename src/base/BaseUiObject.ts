import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Shared UI infrastructure for Pages and Components alike: generic
 * Locator-based waiting, actions, getters and assertions. Whole-page
 * capabilities (navigation, reload, URL assertions) do not belong here —
 * see BasePage.
 */
export class BaseUiObject {
  protected readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /*=========================
  Esperas
  =========================*/
  async waitForVisible(locator: Locator) {
    await expect(locator).toBeVisible();
  }

  async waitForHidden(locator: Locator) {
    await expect(locator).toBeHidden();
  }

  async waitForEnabled(locator: Locator) {
    await expect(locator).toBeEnabled();
  }

  /*=========================
  Acciones
  =========================*/
  async click(locator: Locator) {
    await this.waitForVisible(locator);
    await locator.click();
  }

  async fill(locator: Locator, text: string) {
    await this.waitForVisible(locator);
    await locator.fill(text);
  }

  async clear(locator: Locator) {
    await locator.clear();
  }

  async check(locator: Locator) {
    await this.waitForVisible(locator);
    await locator.check();
  }

  async uncheck(locator: Locator) {
    await this.waitForVisible(locator);
    await locator.uncheck();
  }

  async pressEnter(locator: Locator) {
    await locator.press('Enter');
  }

  async clearAndFill(locator: Locator, text: string) {
    await this.waitForVisible(locator);
    await locator.fill('');
    await locator.fill(text);
  }

  /*=========================
  Obtener Valores
  =========================*/
  async getText(locator: Locator) {
    await this.waitForVisible(locator);
    return await locator.textContent();
  }

  async getInputValue(locator: Locator) {
    return await locator.inputValue();
  }

  /*=========================
  Validaciones
  =========================*/
  async expectText(locator: Locator, text: string) {
    await expect(locator).toHaveText(text);
  }

  async expectContainsText(locator: Locator, text: string) {
    await expect(locator).toContainText(text);
  }

  async expectValue(locator: Locator, value: string) {
    await expect(locator).toHaveValue(value);
  }

  async expectChecked(locator: Locator) {
    await expect(locator).toBeChecked();
  }

  async expectNotChecked(locator: Locator) {
    await expect(locator).not.toBeChecked();
  }
}
