import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';
import { requireBaseUrl } from '../../config/index.js';
import { ExampleNavigationComponent } from '../../components/example/ExampleNavigationComponent.js';

/**
 * Minimal, neutral Page Object demonstrating the framework's pattern:
 * BasePage + composed Component, driven entirely by central config (no
 * hardcoded URL, no application-specific business concepts).
 */
export class ExamplePage extends BasePage {
  readonly navigation: ExampleNavigationComponent;

  private readonly heading: Locator;

  constructor(page: Page) {
    super(page);
    this.navigation = new ExampleNavigationComponent(page);
    this.heading = page.getByRole('heading', { level: 1 });
  }

  async open(): Promise<void> {
    await this.goto(requireBaseUrl());
  }

  async expectHeadingToContain(expectedText: string): Promise<void> {
    await this.expectContainsText(this.heading, expectedText);
  }

  async expectLinkVisible(linkName: string): Promise<void> {
    await this.waitForVisible(this.page.getByRole('link', { name: linkName, exact: true }));
  }
}
