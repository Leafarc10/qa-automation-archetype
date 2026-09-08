import type { Page } from '@playwright/test';
import { SauceDemoLoginPage } from '../pages/sauceDemo/SauceDemoLoginPage.js';
import { SauceDemoInventoryPage } from '../pages/sauceDemo/SauceDemoInventoryPage.js';
import { SauceDemoCartPage } from '../pages/sauceDemo/SauceDemoCartPage.js';
import { SauceDemoCheckoutInfoPage } from '../pages/sauceDemo/SauceDemoCheckoutInfoPage.js';
import { SauceDemoCheckoutOverviewPage } from '../pages/sauceDemo/SauceDemoCheckoutOverviewPage.js';
import { SauceDemoCheckoutCompletePage } from '../pages/sauceDemo/SauceDemoCheckoutCompletePage.js';

export class Pages {
  readonly sauceDemoLogin: SauceDemoLoginPage;
  readonly sauceDemoInventory: SauceDemoInventoryPage;
  readonly sauceDemoCart: SauceDemoCartPage;
  readonly sauceDemoCheckoutInfo: SauceDemoCheckoutInfoPage;
  readonly sauceDemoCheckoutOverview: SauceDemoCheckoutOverviewPage;
  readonly sauceDemoCheckoutComplete: SauceDemoCheckoutCompletePage;

  constructor(page: Page) {
    this.sauceDemoLogin = new SauceDemoLoginPage(page);
    this.sauceDemoInventory = new SauceDemoInventoryPage(page);
    this.sauceDemoCart = new SauceDemoCartPage(page);
    this.sauceDemoCheckoutInfo = new SauceDemoCheckoutInfoPage(page);
    this.sauceDemoCheckoutOverview = new SauceDemoCheckoutOverviewPage(page);
    this.sauceDemoCheckoutComplete = new SauceDemoCheckoutCompletePage(page);
  }
}
