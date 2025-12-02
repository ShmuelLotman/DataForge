#!/usr/bin/env tsx
/**
 * Script to run better-auth migration
 * 
 * Usage:
 *   npx tsx scripts/run-auth-migration.ts
 * 
 * Or set DATABASE_URL environment variable:
 *   DATABASE_URL=your_connection_string npx tsx scripts/run-auth-migration.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'

const migrationPath = join(process.cwd(), 'supabase/migrations/004_better_auth_tables.sql')
const sql = readFileSync(migrationPath, 'utf-8')

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    console.log('\nUsage:')
    console.log('  DATABASE_URL=your_connection_string npx tsx scripts/run-auth-migration.ts')
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    console.log('🔄 Running better-auth migration...')
    await pool.query(sql)
    console.log('✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

runMigration()

