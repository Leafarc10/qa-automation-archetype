import { BaseRepository } from '../BaseRepository.js';
import { QueryBuilder } from '../../builders/QueryBuilder.js';
import type { DatabaseClient } from '../../clients/DatabaseClient.js';
import type { QueryResult } from '../../types/db.types.js';

/**
 * Neutral demonstration row shape. EXAMPLE_ITEMS is a contract used to show
 * the Repository pattern — it is NOT created, seeded, or asserted to exist in
 * any real database by this file.
 */
export type ExampleItem = {
  ID: number;
  NAME: string;
  STATUS: string;
};

const EXAMPLE_TABLE = 'EXAMPLE_ITEMS';

/**
 * Columns this repository allows QueryBuilder to reference. Owned by this
 * file's own code, never accepted from Steps/Features/external input.
 */
const EXAMPLE_FIELDS = ['ID', 'NAME', 'STATUS'] as const;

/**
 * First neutral, real consumer of BaseRepository/QueryBuilder. Read-only by
 * design: EXAMPLE_ITEMS isn't backed by a real schema, so adding write
 * methods here would exercise mutations against data that doesn't exist.
 */
export class ExampleRepository extends BaseRepository {
  constructor(client: DatabaseClient) {
    super(client);
  }

  async findById(id: number): Promise<QueryResult<ExampleItem>> {
    const where = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: '=', value: id }],
      EXAMPLE_FIELDS
    );

    return this.select<ExampleItem>(
      `SELECT ID, NAME, STATUS FROM ${EXAMPLE_TABLE} ${where.clause}`,
      where.binds
    );
  }

  async findByStatus(status: string): Promise<QueryResult<ExampleItem>> {
    const where = QueryBuilder.buildWhere(
      [{ field: 'STATUS', operator: '=', value: status }],
      EXAMPLE_FIELDS
    );

    return this.select<ExampleItem>(
      `SELECT ID, NAME, STATUS FROM ${EXAMPLE_TABLE} ${where.clause}`,
      where.binds
    );
  }
}
