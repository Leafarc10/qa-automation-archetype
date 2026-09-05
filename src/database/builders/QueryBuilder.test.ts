import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { QueryBuilder, QueryBuilderError } from './QueryBuilder.ts';
import type { FilterCondition, SqlOperator } from '../types/db.types.ts';

const ID_FIELDS = ['ID'] as const;
const USER_FIELDS = ['ID', 'NAME', 'EMAIL', 'STATUS'] as const;
const USER_TABLES = ['USERS'] as const;

describe('QueryBuilder.buildWhere — binds', () => {
  it('an "=" filter binds the value and never interpolates it into the SQL string', () => {
    const { clause, binds } = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: '=', value: 42 }],
      ID_FIELDS
    );

    assert.equal(clause, 'WHERE ID = :ID_0');
    assert.deepEqual(binds, { ID_0: 42 });
  });

  it('a malicious string value travels as a bind and never appears in the SQL string', () => {
    const malicious = '1); DROP TABLE USERS; --';
    const { clause, binds } = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: '=', value: malicious }],
      ID_FIELDS
    );

    assert.equal(clause.includes(malicious), false);
    assert.equal(binds.ID_0, malicious);
  });

  it('IN generates exactly one bind per value', () => {
    const { clause, binds } = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: 'IN', value: [1, 2, 3] }],
      ID_FIELDS
    );

    assert.equal(clause, 'WHERE ID IN (:ID_0_0, :ID_0_1, :ID_0_2)');
    assert.deepEqual(binds, { ID_0_0: 1, ID_0_1: 2, ID_0_2: 3 });
  });

  it('BETWEEN generates exactly two binds', () => {
    const { clause, binds } = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: 'BETWEEN', value: [10, 20] }],
      ID_FIELDS
    );

    assert.equal(clause, 'WHERE ID BETWEEN :ID_0_start AND :ID_0_end');
    assert.equal(Object.keys(binds).length, 2);
    assert.deepEqual(binds, { ID_0_start: 10, ID_0_end: 20 });
  });
});

describe('QueryBuilder — identifier allowlists', () => {
  it('rejects a WHERE field that is not in the allowlist', () => {
    assert.throws(
      () => QueryBuilder.buildWhere([{ field: 'NAME', operator: '=', value: 'x' }], ID_FIELDS),
      QueryBuilderError
    );
  });

  it('rejects a malicious identifier shape even when it is present in the allowlist itself', () => {
    const maliciousField = 'USERS; DROP TABLE USERS; --';
    const filters: FilterCondition[] = [{ field: maliciousField, operator: '=', value: 1 }];

    // The allowlist itself contains the malicious string: identifier *shape*
    // validation must reject it before allowlist membership is even checked.
    assert.throws(() => QueryBuilder.buildWhere(filters, [maliciousField]), QueryBuilderError);
  });

  it('rejects an INSERT table that is not in the allowed tables list', () => {
    assert.throws(
      () => QueryBuilder.buildInsert('OTHER_TABLE', { NAME: 'x' }, USER_TABLES, USER_FIELDS),
      QueryBuilderError
    );
  });

  it('rejects an INSERT column that is not in the allowed columns list', () => {
    assert.throws(
      () => QueryBuilder.buildInsert('USERS', { PASSWORD: 'x' }, USER_TABLES, USER_FIELDS),
      QueryBuilderError
    );
  });

  it('rejects an ORDER BY field that is not in the allowlist', () => {
    assert.throws(() => QueryBuilder.buildOrderBy('NAME', ID_FIELDS), QueryBuilderError);
  });
});

describe('QueryBuilder — operators', () => {
  it('accepts every documented operator for a plain filter shape', () => {
    for (const operator of ['=', '!=', '>', '<', '>=', '<='] as const) {
      const { clause } = QueryBuilder.buildWhere([{ field: 'ID', operator, value: 1 }], ID_FIELDS);
      assert.equal(clause, `WHERE ID ${operator} :ID_0`);
    }
  });

  it('rejects an operator not on the allowed list, even if a caller bypasses the type system', () => {
    const filters = [{ field: 'ID', operator: 'DROP' as unknown as SqlOperator, value: 1 }];

    assert.throws(() => QueryBuilder.buildWhere(filters, ID_FIELDS), QueryBuilderError);
  });

  it('accepts AND and OR as the logical operator joining multiple conditions', () => {
    const filters: FilterCondition[] = [
      { field: 'ID', operator: '=', value: 1 },
      { field: 'NAME', operator: '=', value: 'x' },
    ];

    const and = QueryBuilder.buildWhere(filters, USER_FIELDS, 'AND');
    assert.equal(and.clause, 'WHERE ID = :ID_0 AND NAME = :NAME_1');

    const or = QueryBuilder.buildWhere(filters, USER_FIELDS, 'OR');
    assert.equal(or.clause, 'WHERE ID = :ID_0 OR NAME = :NAME_1');
  });

  it('rejects a logical operator other than AND/OR, even if a caller bypasses the type system', () => {
    const filters: FilterCondition[] = [{ field: 'ID', operator: '=', value: 1 }];

    assert.throws(
      () => QueryBuilder.buildWhere(filters, ID_FIELDS, 'XOR' as unknown as 'AND' | 'OR'),
      QueryBuilderError
    );
  });
});

describe('QueryBuilder.buildWhere — edge cases', () => {
  it('IN with an empty array is rejected', () => {
    assert.throws(
      () => QueryBuilder.buildWhere([{ field: 'ID', operator: 'IN', value: [] }], ID_FIELDS),
      QueryBuilderError
    );
  });

  it('BETWEEN with one value is rejected', () => {
    assert.throws(
      () => QueryBuilder.buildWhere([{ field: 'ID', operator: 'BETWEEN', value: [1] }], ID_FIELDS),
      QueryBuilderError
    );
  });

  it('BETWEEN with three values is rejected', () => {
    assert.throws(
      () =>
        QueryBuilder.buildWhere(
          [{ field: 'ID', operator: 'BETWEEN', value: [1, 2, 3] }],
          ID_FIELDS
        ),
      QueryBuilderError
    );
  });

  it('IS NULL produces no bind', () => {
    const { clause, binds } = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: 'IS NULL' }],
      ID_FIELDS
    );

    assert.equal(clause, 'WHERE ID IS NULL');
    assert.deepEqual(binds, {});
  });

  it('IS NOT NULL produces no bind', () => {
    const { clause, binds } = QueryBuilder.buildWhere(
      [{ field: 'ID', operator: 'IS NOT NULL' }],
      ID_FIELDS
    );

    assert.equal(clause, 'WHERE ID IS NOT NULL');
    assert.deepEqual(binds, {});
  });

  it('an empty filters array returns an empty clause and no binds', () => {
    const result = QueryBuilder.buildWhere([], ID_FIELDS);
    assert.deepEqual(result, { clause: '', binds: {} });
  });
});

describe('QueryBuilder.buildInsert / buildUpdate — writes', () => {
  it('buildUpdate without filters is rejected (never an unconditional UPDATE)', () => {
    assert.throws(
      () =>
        QueryBuilder.buildUpdate('USERS', { NAME: 'x' }, [], USER_TABLES, USER_FIELDS, USER_FIELDS),
      QueryBuilderError
    );
  });

  it('buildInsert without any columns is rejected', () => {
    assert.throws(
      () => QueryBuilder.buildInsert('USERS', {}, USER_TABLES, USER_FIELDS),
      QueryBuilderError
    );
  });

  it('buildUpdate without any columns is rejected', () => {
    assert.throws(
      () =>
        QueryBuilder.buildUpdate(
          'USERS',
          {},
          [{ field: 'ID', operator: '=', value: 1 }],
          USER_TABLES,
          USER_FIELDS,
          USER_FIELDS
        ),
      QueryBuilderError
    );
  });

  it('buildUpdate rejects a SET column that is not in the allowed columns list', () => {
    assert.throws(
      () =>
        QueryBuilder.buildUpdate(
          'USERS',
          { PASSWORD: 'x' },
          [{ field: 'ID', operator: '=', value: 1 }],
          USER_TABLES,
          USER_FIELDS,
          USER_FIELDS
        ),
      QueryBuilderError
    );
  });

  it('buildInsert generates a bind placeholder per column and returns the values as binds', () => {
    const { query, binds } = QueryBuilder.buildInsert(
      'USERS',
      { NAME: 'Ada', EMAIL: 'ada@example.com' },
      USER_TABLES,
      USER_FIELDS
    );

    assert.match(query, /INSERT INTO USERS/);
    assert.match(query, /\(NAME, EMAIL\)/);
    assert.match(query, /VALUES \(:NAME, :EMAIL\)/);
    assert.equal(query.includes('Ada'), false);
    assert.equal(query.includes('ada@example.com'), false);
    assert.deepEqual(binds, { NAME: 'Ada', EMAIL: 'ada@example.com' });
  });

  it('buildUpdate generates a bind placeholder per SET column plus the WHERE binds', () => {
    const { query, binds } = QueryBuilder.buildUpdate(
      'USERS',
      { NAME: 'Ada' },
      [{ field: 'ID', operator: '=', value: 7 }],
      USER_TABLES,
      USER_FIELDS,
      USER_FIELDS
    );

    assert.match(query, /UPDATE USERS/);
    assert.match(query, /SET NAME = :NAME/);
    assert.match(query, /WHERE ID = :ID_0/);
    assert.equal(query.includes('Ada'), false);
    assert.deepEqual(binds, { NAME: 'Ada', ID_0: 7 });
  });
});

describe('QueryBuilder.buildOrderBy / buildOraclePagination', () => {
  it('accepts an allowlisted field with the default ASC direction', () => {
    assert.equal(QueryBuilder.buildOrderBy('ID', ID_FIELDS), 'ORDER BY ID ASC');
  });

  it('accepts DESC as an explicit direction', () => {
    assert.equal(QueryBuilder.buildOrderBy('ID', ID_FIELDS, 'DESC'), 'ORDER BY ID DESC');
  });

  it('rejects a direction other than ASC/DESC, even if a caller bypasses the type system', () => {
    assert.throws(
      () => QueryBuilder.buildOrderBy('ID', ID_FIELDS, 'SIDEWAYS' as unknown as 'ASC' | 'DESC'),
      QueryBuilderError
    );
  });

  it('rejects a non-integer pagination limit', () => {
    assert.throws(
      () => QueryBuilder.buildOraclePagination('SELECT * FROM USERS', 1.5),
      QueryBuilderError
    );
  });

  it('rejects a zero or negative pagination limit', () => {
    assert.throws(
      () => QueryBuilder.buildOraclePagination('SELECT * FROM USERS', 0),
      QueryBuilderError
    );
    assert.throws(
      () => QueryBuilder.buildOraclePagination('SELECT * FROM USERS', -5),
      QueryBuilderError
    );
  });

  it('a valid limit wraps the base query in the expected Oracle ROWNUM structure', () => {
    const wrapped = QueryBuilder.buildOraclePagination('SELECT * FROM USERS', 20);

    assert.match(wrapped, /SELECT \* FROM \(/);
    assert.match(wrapped, /SELECT \* FROM USERS/);
    assert.match(wrapped, /WHERE ROWNUM <= 20/);
  });
});
