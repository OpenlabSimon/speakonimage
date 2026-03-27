import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Prevent multiple instances of Prisma Client in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let productionPrisma: PrismaClient | undefined;

export function resolveDatabaseConnectionConfig(connectionString: string): {
  connectionString: string;
  searchPath?: string;
} {
  try {
    const parsed = new URL(connectionString);
    const explicitSchema = process.env.DATABASE_SCHEMA?.trim();
    const schemaFromUrl = parsed.searchParams.get('schema')?.trim();
    const searchPath = explicitSchema || schemaFromUrl || undefined;

    if (schemaFromUrl) {
      parsed.searchParams.delete('schema');
    }

    return {
      connectionString: parsed.toString(),
      searchPath,
    };
  } catch {
    return { connectionString };
  }
}

function quotePgIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function createPrismaClient() {
  const rawConnectionString = process.env.DATABASE_URL;

  if (!rawConnectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const { connectionString, searchPath } = resolveDatabaseConnectionConfig(rawConnectionString);
  const pool = new Pool({ connectionString });
  if (searchPath) {
    pool.on('connect', (client) => {
      void client.query(`SET search_path TO ${quotePgIdentifier(searchPath)}`);
    });
  }
  const adapter = new PrismaPg(pool, searchPath ? { schema: searchPath } : undefined);

  return new PrismaClient({ adapter });
}

export function getPrismaClient() {
  if (process.env.NODE_ENV !== 'production') {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }

    return globalForPrisma.prisma;
  }

  if (!productionPrisma) {
    productionPrisma = createPrismaClient();
  }

  return productionPrisma;
}

// Lazily instantiate Prisma so route imports can be analyzed during build
// without requiring DATABASE_URL until a request actually touches the DB.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);

    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;
