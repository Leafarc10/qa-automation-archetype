import type { DatabaseClient } from '../src/database/clients/DatabaseClient.js';
import { config } from '../src/config/index.js';

/**
 * Sole owner of the process/worker-wide DatabaseClient lifecycle: create
 * (BeforeAll), share (Before, one RepositoryContainer per scenario built on
 * the same client), close (AfterAll). Nothing outside this module builds or
 * closes a DatabaseClient. A dynamic import keeps OracleDatabaseClient (and
 * therefore `oracledb`) out of the process entirely when DB_ENABLED=false.
 */
let sharedClient: DatabaseClient | undefined;

export async function initDatabaseClient(): Promise<void> {
  if (!config.db.enabled) return;
  if (sharedClient) return;

  const { OracleDatabaseClient } = await import('../src/database/clients/OracleDatabaseClient.js');

  sharedClient = new OracleDatabaseClient({
    user: config.db.user as string,
    password: config.db.password as string,
    connectString: config.db.connectString as string,
    oracleClientLibDir: config.db.oracleClientLibDir,
  });
}

export function getDatabaseClient(): DatabaseClient | undefined {
  return sharedClient;
}

export async function closeDatabaseClient(): Promise<void> {
  if (!sharedClient) return;

  const client = sharedClient;
  sharedClient = undefined;
  await client.close();
}
