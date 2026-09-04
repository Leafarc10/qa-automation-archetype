import { Before, After, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { config } from '../src/config/index.js';
import { CustomWorld } from './world.js';
import { RepositoryContainer } from '../src/database/RepositoryContainer.js';
import { initDatabaseClient, getDatabaseClient, closeDatabaseClient } from './databaseLifecycle.js';

setDefaultTimeout(config.defaultTimeoutMs);

BeforeAll(async () => {
  await initDatabaseClient();
});

Before(async function (this: CustomWorld) {
  await this.init();

  const client = getDatabaseClient();
  if (client) {
    this.repositories = new RepositoryContainer(client);
  }
});

After(async function (this: CustomWorld) {
  await this.close();
});

AfterAll(async () => {
  // Reporting (JSON/HTML) is produced directly by Cucumber's own formatters
  // (see cucumber.js) — no custom post-processing here. This hook keeps only
  // the DB lifecycle responsibility: a close failure is logged clearly but
  // never thrown from here, so it can never be mistaken for a test failure
  // or otherwise affect the run's real pass/fail outcome.
  try {
    await closeDatabaseClient();
  } catch (err) {
    console.error('Error closing database client:', err);
  }
});
