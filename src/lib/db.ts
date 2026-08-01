import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL!

/**
 * Bump when the Prisma schema gains/renames fields that the running
 * Next.js process might still hold in a cached PrismaClient (HMR).
 * That forces a fresh client instead of serving a stale DMMF.
 */
const PRISMA_SCHEMA_VERSION = 'event-archivedAt-v1'

const prismaClientSingleton = () => {
  const pool = new Pool({ connectionString, max: 15 })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined
  prismaSchemaVersion: string | undefined
} & typeof global

if (
  process.env.NODE_ENV !== 'production' &&
  globalThis.prismaSchemaVersion !== PRISMA_SCHEMA_VERSION
) {
  // Drop stale client from a previous schema generation
  try {
    void globalThis.prismaGlobal?.$disconnect()
  } catch {
    // ignore
  }
  globalThis.prismaGlobal = undefined
  globalThis.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}

const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma
  globalThis.prismaSchemaVersion = PRISMA_SCHEMA_VERSION
}
