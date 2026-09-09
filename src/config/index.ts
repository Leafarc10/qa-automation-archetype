import dotenv from 'dotenv';

dotenv.config();

export const browserNames = ['chromium', 'firefox', 'webkit'] as const;

export type BrowserName = (typeof browserNames)[number];

type DatabaseConfig = {
  enabled: boolean;
  user?: string;
  password?: string;
  connectString?: string;
  oracleClientLibDir?: string;
};

export type AppConfig = {
  sauceDemoBaseUrl: string;
  headless: boolean;
  browser: BrowserName;
  defaultTimeoutMs: number;
  db: DatabaseConfig;
};

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function parseBoolean(name: string, defaultValue: boolean): boolean {
  const value = optionalEnv(name);
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new Error(`${name} must be "true" or "false".`);
}

function parsePositiveInteger(name: string, defaultValue: number): number {
  const value = optionalEnv(name);
  if (value === undefined) return defaultValue;

  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
}

function parseBrowser(): BrowserName {
  const browser = optionalEnv('BROWSER') ?? 'chromium';
  if (!browserNames.includes(browser as BrowserName)) {
    throw new Error(`BROWSER must be one of: ${browserNames.join(', ')}.`);
  }

  return browser as BrowserName;
}

function validateDatabaseConfig(database: DatabaseConfig): void {
  if (!database.enabled) return;

  const requiredVariables = [
    ['DB_USER', database.user],
    ['DB_PASSWORD', database.password],
    ['DB_CONNECT_STRING', database.connectString],
  ];

  const missingVariables = requiredVariables.filter(([, value]) => !value).map(([name]) => name);

  if (missingVariables.length > 0) {
    throw new Error(`DB_ENABLED=true requires: ${missingVariables.join(', ')}.`);
  }
}

const database: DatabaseConfig = {
  enabled: parseBoolean('DB_ENABLED', false),
  user: optionalEnv('DB_USER'),
  password: optionalEnv('DB_PASSWORD'),
  connectString: optionalEnv('DB_CONNECT_STRING'),
  oracleClientLibDir: optionalEnv('ORACLE_CLIENT_LIB_DIR'),
};

validateDatabaseConfig(database);

export const config: AppConfig = {
  sauceDemoBaseUrl: optionalEnv('SAUCEDEMO_BASE_URL') ?? 'https://www.saucedemo.com',
  headless: parseBoolean('HEADLESS', true),
  browser: parseBrowser(),
  defaultTimeoutMs: parsePositiveInteger('DEFAULT_TIMEOUT_MS', 120_000),
  db: database,
};

export function requireSauceDemoBaseUrl(): string {
  return config.sauceDemoBaseUrl;
}
