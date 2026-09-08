import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONFIG_MODULE_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'index.ts');

const CONFIG_ENV_KEYS = [
  'BASE_URL',
  'SAUCEDEMO_BASE_URL',
  'HEADLESS',
  'BROWSER',
  'DEFAULT_TIMEOUT_MS',
  'DB_ENABLED',
  'DB_USER',
  'DB_PASSWORD',
  'DB_CONNECT_STRING',
  'ORACLE_CLIENT_LIB_DIR',
] as const;

type ConfigEnv = Partial<Record<(typeof CONFIG_ENV_KEYS)[number], string>>;

let importCounter = 0;

/**
 * Loads a fresh instance of src/config/index.ts under a fully controlled
 * environment: every env var the module reads is cleared first (so neither
 * the developer's shell nor a leftover value from a previous case can leak
 * in), then only `env` is applied. The import happens from a freshly
 * created, empty directory, so the module's own `dotenv.config()` call
 * finds no `.env` to inject from — a real .env in the working tree can
 * never complete a variable this suite means to leave absent. A
 * cache-busting query string forces Node to re-evaluate the module (and
 * its import-time validation) instead of returning a previously cached
 * instance. cwd and process.env are restored before this function returns
 * or throws, so a case's own assertions can never see leaked state.
 */
async function loadConfig(env: ConfigEnv) {
  const originalCwd = process.cwd();
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-config-test-'));
  const originalEnv: Partial<Record<string, string>> = {};

  for (const key of CONFIG_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }

  process.chdir(emptyDir);
  importCounter += 1;
  const moduleUrl = `${pathToFileURL(CONFIG_MODULE_PATH).href}?case=${importCounter}`;

  try {
    return await import(moduleUrl);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(emptyDir, { recursive: true, force: true });
    for (const key of CONFIG_ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
}

describe('config — defaults', () => {
  it('uses the real defaults when no relevant env var is set', async () => {
    const mod = await loadConfig({});

    assert.equal(mod.config.headless, true);
    assert.equal(mod.config.browser, 'chromium');
    assert.equal(mod.config.defaultTimeoutMs, 120_000);
    assert.equal(mod.config.db.enabled, false);
    assert.equal(mod.config.baseUrl, undefined);
    assert.equal(mod.config.sauceDemoBaseUrl, 'https://www.saucedemo.com');
  });
});

describe('config — HEADLESS', () => {
  it('accepts "true"', async () => {
    const mod = await loadConfig({ HEADLESS: 'true' });
    assert.equal(mod.config.headless, true);
  });

  it('accepts "false"', async () => {
    const mod = await loadConfig({ HEADLESS: 'false' });
    assert.equal(mod.config.headless, false);
  });

  it('rejects any value other than "true"/"false"', async () => {
    await assert.rejects(loadConfig({ HEADLESS: 'yes' }), /HEADLESS must be "true" or "false"\./);
  });
});

describe('config — BROWSER', () => {
  it('accepts every browser name the module itself declares as valid', async () => {
    const probe = await loadConfig({});

    for (const browser of probe.browserNames) {
      const mod = await loadConfig({ BROWSER: browser });
      assert.equal(mod.config.browser, browser);
    }
  });

  it('rejects an unknown browser name', async () => {
    const probe = await loadConfig({});
    const expectedMessage = `BROWSER must be one of: ${probe.browserNames.join(', ')}.`;

    await assert.rejects(loadConfig({ BROWSER: 'edge' }), { message: expectedMessage });
  });
});

describe('config — DEFAULT_TIMEOUT_MS', () => {
  it('rejects zero', async () => {
    await assert.rejects(
      loadConfig({ DEFAULT_TIMEOUT_MS: '0' }),
      /DEFAULT_TIMEOUT_MS must be a positive integer\./
    );
  });

  it('rejects a negative value', async () => {
    await assert.rejects(
      loadConfig({ DEFAULT_TIMEOUT_MS: '-5' }),
      /DEFAULT_TIMEOUT_MS must be a positive integer\./
    );
  });

  it('rejects a decimal value', async () => {
    await assert.rejects(
      loadConfig({ DEFAULT_TIMEOUT_MS: '1.5' }),
      /DEFAULT_TIMEOUT_MS must be a positive integer\./
    );
  });

  it('rejects a non-numeric string', async () => {
    await assert.rejects(
      loadConfig({ DEFAULT_TIMEOUT_MS: 'soon' }),
      /DEFAULT_TIMEOUT_MS must be a positive integer\./
    );
  });

  it('accepts a valid positive integer', async () => {
    const mod = await loadConfig({ DEFAULT_TIMEOUT_MS: '5000' });
    assert.equal(mod.config.defaultTimeoutMs, 5000);
  });
});

describe('config — DB_ENABLED', () => {
  it('DB_ENABLED=false never requires any DB credential', async () => {
    const mod = await loadConfig({ DB_ENABLED: 'false' });
    assert.equal(mod.config.db.enabled, false);
  });

  it('DB_ENABLED=true rejects when every required credential is missing, naming all three', async () => {
    await assert.rejects(loadConfig({ DB_ENABLED: 'true' }), {
      message: 'DB_ENABLED=true requires: DB_USER, DB_PASSWORD, DB_CONNECT_STRING.',
    });
  });

  it('DB_ENABLED=true identifies only the missing variable by name, and never leaks the values of the ones supplied', async () => {
    await assert.rejects(
      loadConfig({
        DB_ENABLED: 'true',
        DB_USER: 'prod_user_do_not_leak',
        DB_CONNECT_STRING: 'prod_connect_string_do_not_leak',
      }),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.equal(err.message, 'DB_ENABLED=true requires: DB_PASSWORD.');
        assert.equal(err.message.includes('prod_user_do_not_leak'), false);
        assert.equal(err.message.includes('prod_connect_string_do_not_leak'), false);
        return true;
      }
    );
  });

  it('DB_ENABLED=true accepts and stores every required credential when all are present', async () => {
    const mod = await loadConfig({
      DB_ENABLED: 'true',
      DB_USER: 'app_user',
      DB_PASSWORD: 'app_password',
      DB_CONNECT_STRING: 'app_connect_string',
    });

    assert.equal(mod.config.db.enabled, true);
    assert.equal(mod.config.db.user, 'app_user');
    assert.equal(mod.config.db.password, 'app_password');
    assert.equal(mod.config.db.connectString, 'app_connect_string');
  });
});

describe('config — BASE_URL / requireBaseUrl()', () => {
  it('requireBaseUrl() throws a clear error when BASE_URL is absent', async () => {
    const mod = await loadConfig({});
    assert.throws(
      () => mod.requireBaseUrl(),
      /BASE_URL is required before navigating to an application\./
    );
  });

  it('requireBaseUrl() returns exactly the configured BASE_URL', async () => {
    const mod = await loadConfig({ BASE_URL: 'https://example.test' });
    assert.equal(mod.config.baseUrl, 'https://example.test');
    assert.equal(mod.requireBaseUrl(), 'https://example.test');
  });

  it('treats a blank BASE_URL as absent', async () => {
    const mod = await loadConfig({ BASE_URL: '   ' });
    assert.equal(mod.config.baseUrl, undefined);
    assert.throws(() => mod.requireBaseUrl(), /BASE_URL is required/);
  });
});

describe('config — SAUCEDEMO_BASE_URL / requireSauceDemoBaseUrl()', () => {
  it('applies the public default when no relevant env var is set', async () => {
    const mod = await loadConfig({});
    assert.equal(mod.config.sauceDemoBaseUrl, 'https://www.saucedemo.com');
  });

  it('takes the configured value as-is when set', async () => {
    const mod = await loadConfig({ SAUCEDEMO_BASE_URL: 'https://staging.saucedemo.example' });
    assert.equal(mod.config.sauceDemoBaseUrl, 'https://staging.saucedemo.example');
  });

  it('requireSauceDemoBaseUrl() returns the configured value', async () => {
    const mod = await loadConfig({ SAUCEDEMO_BASE_URL: 'https://staging.saucedemo.example' });
    assert.equal(mod.requireSauceDemoBaseUrl(), 'https://staging.saucedemo.example');
  });

  it('treats a blank SAUCEDEMO_BASE_URL as absent and falls back to the default', async () => {
    const mod = await loadConfig({ SAUCEDEMO_BASE_URL: '   ' });
    assert.equal(mod.config.sauceDemoBaseUrl, 'https://www.saucedemo.com');
    assert.equal(mod.requireSauceDemoBaseUrl(), 'https://www.saucedemo.com');
  });
});
