import type { DatabaseClient, ExecuteOptions } from '../clients/DatabaseClient.js';
import type { BindParams, QueryResult } from '../types/db.types.js';

export abstract class BaseRepository {
  constructor(protected readonly client: DatabaseClient) {}

  protected async execute<T = unknown>(
    query: string,
    binds?: BindParams,
    options?: ExecuteOptions
  ): Promise<QueryResult<T>> {
    return this.client.execute<T>(query, binds, options);
  }

  protected async select<T = unknown>(query: string, binds?: BindParams): Promise<QueryResult<T>> {
    return this.execute<T>(query, binds, { autoCommit: false });
  }

  protected async insert<T = unknown>(query: string, binds?: BindParams): Promise<QueryResult<T>> {
    return this.execute<T>(query, binds);
  }

  protected async update<T = unknown>(query: string, binds?: BindParams): Promise<QueryResult<T>> {
    return this.execute<T>(query, binds);
  }

  protected async delete<T = unknown>(query: string, binds?: BindParams): Promise<QueryResult<T>> {
    return this.execute<T>(query, binds);
  }

  protected async executeProcedure<T = unknown>(
    query: string,
    binds?: BindParams
  ): Promise<QueryResult<T>> {
    return this.execute<T>(query, binds);
  }
}
