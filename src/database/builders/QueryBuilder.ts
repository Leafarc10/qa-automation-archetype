import type {
  BindParams,
  FilterCondition,
  IdentifierList,
  SqlOperator,
  WhereClause,
} from '../types/db.types.js';

/**
 * QueryBuilder is infrastructure for Repositories (extends BaseRepository),
 * never a direct dependency of Step Definitions:
 *
 *   Step -> RepositoryContainer -> Repository -> BaseRepository / QueryBuilder -> DatabaseClient
 *
 * A repository never exposes QueryBuilder itself to a Step; it only exposes
 * domain methods built on top of it.
 *
 * Security model: values always travel as binds. Identifiers (table/column
 * names, ORDER BY field) can never be bound as SQL parameters, so every
 * identifier accepted here must come from an explicit allowlist supplied by
 * the calling repository's own code — never from Scenario data, Step
 * arguments, or any other runtime/user-controlled input.
 */

export class QueryBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryBuilderError';
  }
}

type LogicalOperator = 'AND' | 'OR';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ALLOWED_OPERATORS: readonly SqlOperator[] = [
  '=',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'LIKE',
  'IN',
  'BETWEEN',
  'IS NULL',
  'IS NOT NULL',
];

/**
 * Rejects anything that isn't a plain, unquoted SQL identifier shape AND a
 * member of the caller-supplied allowlist. Never attempts to sanitize or
 * rewrite an invalid value — an invalid identifier always throws.
 */
function assertAllowedIdentifier(value: string, allowed: IdentifierList, kind: string): string {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw new QueryBuilderError(`Invalid SQL identifier for ${kind}: "${String(value)}".`);
  }

  if (!allowed.includes(value)) {
    throw new QueryBuilderError(
      `${kind} "${value}" is not allowed. Allowed: ${allowed.join(', ') || '(none)'}.`
    );
  }

  return value;
}

function assertAllowedOperator(operator: SqlOperator): SqlOperator {
  if (!ALLOWED_OPERATORS.includes(operator)) {
    throw new QueryBuilderError(`Operator "${String(operator)}" is not allowed.`);
  }

  return operator;
}

function assertLogicalOperator(logicalOperator: LogicalOperator): LogicalOperator {
  if (logicalOperator !== 'AND' && logicalOperator !== 'OR') {
    throw new QueryBuilderError(
      `Logical operator must be AND or OR, got "${String(logicalOperator)}".`
    );
  }

  return logicalOperator;
}

export class QueryBuilder {
  /* ==============================
     WHERE DINÁMICO
  ============================== */

  static buildWhere(
    filters: FilterCondition[],
    allowedFields: IdentifierList,
    logicalOperator: LogicalOperator = 'AND'
  ): WhereClause {
    if (!filters.length) {
      return { clause: '', binds: {} };
    }

    assertLogicalOperator(logicalOperator);

    const conditions: string[] = [];
    const binds: BindParams = {};

    filters.forEach((filter, index) => {
      const field = assertAllowedIdentifier(filter.field, allowedFields, 'WHERE field');
      const operator = assertAllowedOperator(filter.operator);
      const paramName = `${field}_${index}`;

      switch (operator) {
        case 'IN': {
          if (!Array.isArray(filter.value) || filter.value.length === 0) {
            throw new QueryBuilderError(`IN requires at least one value for field "${field}".`);
          }

          const inParams: string[] = [];
          filter.value.forEach((val, i) => {
            const inParam = `${paramName}_${i}`;
            inParams.push(`:${inParam}`);
            binds[inParam] = val;
          });
          conditions.push(`${field} IN (${inParams.join(', ')})`);
          break;
        }

        case 'BETWEEN': {
          if (!Array.isArray(filter.value) || filter.value.length !== 2) {
            throw new QueryBuilderError(
              `BETWEEN requires exactly two values for field "${field}".`
            );
          }

          const startParam = `${paramName}_start`;
          const endParam = `${paramName}_end`;
          conditions.push(`${field} BETWEEN :${startParam} AND :${endParam}`);
          binds[startParam] = filter.value[0];
          binds[endParam] = filter.value[1];
          break;
        }

        case 'IS NULL':
        case 'IS NOT NULL':
          conditions.push(`${field} ${operator}`);
          break;

        default:
          conditions.push(`${field} ${operator} :${paramName}`);
          binds[paramName] = filter.value;
      }
    });

    return {
      clause: `WHERE ${conditions.join(` ${logicalOperator} `)}`,
      binds,
    };
  }

  /* ==============================
     ORDER BY
  ============================== */

  static buildOrderBy(
    field: string,
    allowedFields: IdentifierList,
    direction: 'ASC' | 'DESC' = 'ASC'
  ): string {
    const validField = assertAllowedIdentifier(field, allowedFields, 'ORDER BY field');

    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new QueryBuilderError(
        `ORDER BY direction must be ASC or DESC, got "${String(direction)}".`
      );
    }

    return `ORDER BY ${validField} ${direction}`;
  }

  /* ==============================
     PAGINACIÓN — Oracle-specific (ROWNUM, Oracle 11g style).
     Not a generic/multi-engine pagination helper.
  ============================== */

  static buildOraclePagination(baseQuery: string, limit: number): string {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new QueryBuilderError(`Pagination limit must be a positive integer, got "${limit}".`);
    }

    return `
      SELECT * FROM (
        ${baseQuery}
      ) WHERE ROWNUM <= ${limit}
    `;
  }

  /* ==============================
     INSERT DINÁMICO
  ============================== */

  static buildInsert(
    table: string,
    data: Record<string, unknown>,
    allowedTables: IdentifierList,
    allowedColumns: IdentifierList
  ): { query: string; binds: BindParams } {
    const validTable = assertAllowedIdentifier(table, allowedTables, 'table');
    const fields = Object.keys(data);

    if (fields.length === 0) {
      throw new QueryBuilderError('INSERT requires at least one field.');
    }

    const validFields = fields.map((field) =>
      assertAllowedIdentifier(field, allowedColumns, 'INSERT column')
    );
    const bindNames = validFields.map((field) => `:${field}`);

    return {
      query: `
        INSERT INTO ${validTable}
        (${validFields.join(', ')})
        VALUES (${bindNames.join(', ')})
      `,
      binds: data,
    };
  }

  /* ==============================
     UPDATE DINÁMICO
  ============================== */

  static buildUpdate(
    table: string,
    data: Record<string, unknown>,
    filters: FilterCondition[],
    allowedTables: IdentifierList,
    allowedColumns: IdentifierList,
    allowedFilterFields: IdentifierList
  ): { query: string; binds: BindParams } {
    const validTable = assertAllowedIdentifier(table, allowedTables, 'table');
    const fields = Object.keys(data);

    if (fields.length === 0) {
      throw new QueryBuilderError('UPDATE requires at least one field.');
    }

    // An UPDATE with no filters would touch every row in the table. The
    // archetype refuses this by default; a real "update all rows" use case
    // would need its own explicit, clearly-named API — not this one.
    if (filters.length === 0) {
      throw new QueryBuilderError(
        'UPDATE requires at least one filter (WHERE); unconditional updates are not allowed.'
      );
    }

    const setClause = fields
      .map(
        (field) => `${assertAllowedIdentifier(field, allowedColumns, 'UPDATE column')} = :${field}`
      )
      .join(', ');

    const { clause, binds: whereBinds } = this.buildWhere(filters, allowedFilterFields);

    return {
      query: `
        UPDATE ${validTable}
        SET ${setClause}
        ${clause}
      `,
      binds: { ...data, ...whereBinds },
    };
  }
}
