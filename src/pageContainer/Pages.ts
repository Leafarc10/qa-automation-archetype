import type { Page } from '@playwright/test';
import { ExamplePage } from '../pages/example/ExamplePage.js';

export class Pages {
  readonly example: ExamplePage;

  constructor(page: Page) {
    this.example = new ExamplePage(page);
  }
}
