import type { BindParams, QueryResult } from '../types/db.types.js';

/**
 * Small, driver-agnostic execution options. Intentionally does NOT re-export
 * `oracledb.ExecuteOptions` so the contract stays usable by future engines.
 */
export type ExecuteOptions = {
  autoCommit?: boolean;
};

/**
 * Contract every concrete database engine must implement.
 * MUST NOT depend on `oracledb` (or any other driver) types or imports.
 */
export interface DatabaseClient {
  execute<T = unknown>(
    query: string,
    binds?: BindParams,
    options?: ExecuteOptions
  ): Promise<QueryResult<T>>;

  close(): Promise<void>;
}
