import type { Locator, Page } from '@playwright/test';
import { BaseUiObject } from '../../base/BaseUiObject.js';

/**
 * Shared identity for reusable, identifiable UI regions (nav bars, modals,
 * sidebars, widgets): a Component scoped to its own root Locator, with only
 * the UI capabilities BaseUiObject already provides. Whole-page navigation
 * belongs exclusively to BasePage — a Component never gets it.
 */
export class BaseComponent extends BaseUiObject {
  protected readonly root: Locator;

  constructor(page: Page, root: Locator) {
    super(page);
    this.root = root;
  }
}
