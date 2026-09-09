import type { Locator, Page } from '@playwright/test';
import { BasePage } from '../base/BasePage.js';
import { requireSauceDemoBaseUrl } from '../../config/index.js';

/**
 * SauceDemo login screen (https://www.saucedemo.com/). Locators confirmed via
 * MCP: textbox "Username", textbox "Password", button "Login".
 */
export class SauceDemoLoginPage extends BasePage {
  private readonly usernameInput: Locator;
  private readonly passwordInput: Locator;
  private readonly loginButton: Locator;

  constructor(page: Page) {
    super(page);
    this.usernameInput = page.getByRole('textbox', { name: 'Username' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' });
    this.loginButton = page.getByRole('button', { name: 'Login' });
  }

  async open(): Promise<void> {
    await this.goto(requireSauceDemoBaseUrl());
  }

  async login(username: string, password: string): Promise<void> {
    await this.fill(this.usernameInput, username);
    await this.fill(this.passwordInput, password);
    await this.click(this.loginButton);
  }
}
