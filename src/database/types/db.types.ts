export interface QueryResult<T = unknown> {
  rows: T[];
  rowsAffected?: number;
  outBinds?: unknown;
}

export type BindParams = Record<string, unknown>;

export interface WhereClause {
  clause: string;
  binds: BindParams;
}

export type SqlOperator =
  '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'BETWEEN' | 'IS NULL' | 'IS NOT NULL';

export interface FilterCondition {
  field: string;
  operator: SqlOperator;
  /** Omitted/ignored for IS NULL / IS NOT NULL. */
  value?: unknown;
}

/**
 * A finite set of identifiers (table or column names) a repository allows for
 * a given operation. Always supplied by the caller (repository code), never
 * inferred — QueryBuilder has no schema registry of its own.
 */
export type IdentifierList = readonly string[];
