import { afterEach, describe, expect, it } from 'vitest';
import { resolveDatabaseConnectionConfig } from '@/lib/db';

describe('resolveDatabaseConnectionConfig', () => {
  const originalSchema = process.env.DATABASE_SCHEMA;

  afterEach(() => {
    if (originalSchema === undefined) {
      delete process.env.DATABASE_SCHEMA;
    } else {
      process.env.DATABASE_SCHEMA = originalSchema;
    }
  });

  it('extracts schema from DATABASE_URL and removes it from the returned connection string', () => {
    const result = resolveDatabaseConnectionConfig(
      'postgresql://user:pass@example.test/dbname?sslmode=require&schema=smoke_schema'
    );

    expect(result).toEqual({
      connectionString: 'postgresql://user:pass@example.test/dbname?sslmode=require',
      searchPath: 'smoke_schema',
    });
  });

  it('lets DATABASE_SCHEMA override the schema embedded in DATABASE_URL', () => {
    process.env.DATABASE_SCHEMA = 'override_schema';

    const result = resolveDatabaseConnectionConfig(
      'postgresql://user:pass@example.test/dbname?sslmode=require&schema=smoke_schema'
    );

    expect(result).toEqual({
      connectionString: 'postgresql://user:pass@example.test/dbname?sslmode=require',
      searchPath: 'override_schema',
    });
  });

  it('falls back to the original string when parsing fails', () => {
    const result = resolveDatabaseConnectionConfig('not-a-valid-url');

    expect(result).toEqual({
      connectionString: 'not-a-valid-url',
    });
  });
});
