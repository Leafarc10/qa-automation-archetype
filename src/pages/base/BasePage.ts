import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { BaseUiObject } from '../../base/BaseUiObject.js';

export class BasePage extends BaseUiObject {
  constructor(page: Page) {
    super(page);
  }

  /*=========================
  Navegación
  =========================*/
  async goto(url: string) {
    await this.page.goto(url);
  }

  async reload() {
    await this.page.reload();
  }

  async waitForUrlContains(text: string) {
    await expect(this.page).toHaveURL(new RegExp(text));
  }
}
