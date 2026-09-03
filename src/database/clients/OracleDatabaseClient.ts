import { createRequire } from 'module';
import type { BindParams, QueryResult } from '../types/db.types.js';
import type { DatabaseClient, ExecuteOptions } from './DatabaseClient.js';

const require = createRequire(import.meta.url);
const oracledb = require('oracledb');

export type OracleDatabaseClientConfig = {
  user: string;
  password: string;
  connectString: string;
  /** Only required if a feature genuinely needs Thick mode. Thin mode is the default. */
  oracleClientLibDir?: string;
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
};

export class DatabaseError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'DatabaseError';
  }
}

const REQUIRED_CONFIG_KEYS = ['user', 'password', 'connectString'] as const;

function assertConfig(config: OracleDatabaseClientConfig): void {
  const missing = REQUIRED_CONFIG_KEYS.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new DatabaseError(`OracleDatabaseClient config is missing: ${missing.join(', ')}.`);
  }
}

// node-oracledb enforces exactly one mode (Thin or Thick) per process. Once
// the first client actually uses Oracle in this process, every later client
// must request the same mode, or fail loudly instead of silently switching.
type OracleMode = 'thin' | 'thick';
let processOracleMode: OracleMode | undefined;

function ensureConsistentMode(oracleClientLibDir: string | undefined): void {
  const requestedMode: OracleMode = oracleClientLibDir ? 'thick' : 'thin';

  if (processOracleMode && processOracleMode !== requestedMode) {
    throw new DatabaseError(
      `Oracle mode mismatch: this process already initialized node-oracledb in "${processOracleMode}" mode, but this client requests "${requestedMode}" mode. node-oracledb only supports one mode per process.`
    );
  }

  if (processOracleMode) return;

  processOracleMode = requestedMode;

  if (requestedMode === 'thick') {
    try {
      oracledb.initOracleClient({ libDir: oracleClientLibDir });
    } catch (err) {
      throw new DatabaseError('Failed to initialize Oracle Instant Client (Thick mode).', err);
    }
  }
}

/**
 * Only real DatabaseClient implementation today. Oracle is the sole supported
 * engine; a future engine only needs to implement DatabaseClient, without
 * changing BaseRepository/RepositoryContainer.
 */
// oracledb ships no type declarations; kept as an internal, unexported alias
// so the untyped driver surface never leaks through the public DatabaseClient contract.
type OraclePool = any;

export class OracleDatabaseClient implements DatabaseClient {
  private readonly config: OracleDatabaseClientConfig;
  private pool?: OraclePool;

  constructor(config: OracleDatabaseClientConfig) {
    assertConfig(config);
    this.config = config;
  }

  private async getPool(): Promise<OraclePool> {
    if (!this.pool) {
      ensureConsistentMode(this.config.oracleClientLibDir);

      try {
        this.pool = await oracledb.createPool({
          user: this.config.user,
          password: this.config.password,
          connectString: this.config.connectString,
          poolMin: this.config.poolMin ?? 1,
          poolMax: this.config.poolMax ?? 5,
          poolIncrement: this.config.poolIncrement ?? 1,
        });
      } catch (err) {
        throw new DatabaseError('Failed to create the Oracle connection pool.', err);
      }
    }

    return this.pool;
  }

  async execute<T = unknown>(
    query: string,
    binds: BindParams = {},
    options: ExecuteOptions = {}
  ): Promise<QueryResult<T>> {
    const pool = await this.getPool();
    const connection = await pool.getConnection();

    try {
      const result = await connection.execute(query, binds, {
        autoCommit: options.autoCommit ?? true,
        // Row shape preference set per call, not as global driver state — see
        // T11 (previously `oracledb.outFormat = ...` mutated the module globally).
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });

      return {
        rows: (result.rows ?? []) as T[],
        rowsAffected: result.rowsAffected,
        outBinds: result.outBinds,
      };
    } catch (err) {
      throw new DatabaseError('Failed to execute database query.', err);
    } finally {
      await connection.close();
    }
  }

  async close(): Promise<void> {
    if (!this.pool) return;

    const pool = this.pool;
    this.pool = undefined;

    try {
      await pool.close(0);
    } catch (err) {
      throw new DatabaseError('Failed to close the Oracle connection pool.', err);
    }
  }
}
