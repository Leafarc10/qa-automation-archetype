import { setWorldConstructor, World } from '@cucumber/cucumber';
import { chromium, firefox, webkit, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../src/config/index.js';
import { Pages } from '../src/pageContainer/Pages.js';
// Type-only import: keeps the database layer out of the runtime graph for
// UI-only runs. The container itself is built by hooks.ts, only when a
// DatabaseClient exists (DB_ENABLED=true).
import type { RepositoryContainer } from '../src/database/RepositoryContainer.js';

type InitOptions = {
  headless?: boolean;
};

// Free-form per-scenario state; Steps type it according to their own needs.
export type TestContext = Record<string, unknown>;

export class CustomWorld extends World {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  pages!: Pages;
  repositories?: RepositoryContainer;
  // A fresh instance per World; never shared between scenarios.
  testContext: TestContext = {};

  async init(options: InitOptions = {}): Promise<void> {
    const { headless = config.headless } = options;
    const browserType = {
      chromium,
      firefox,
      webkit,
    }[config.browser];

    this.browser = await browserType.launch({ headless });

    this.context = await this.browser.newContext();

    this.page = await this.context.newPage();

    this.pages = new Pages(this.page);
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
  }
}

setWorldConstructor(CustomWorld);
