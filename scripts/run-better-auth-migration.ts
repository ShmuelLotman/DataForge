#!/usr/bin/env tsx
/**
 * Script to run better-auth auto-generated migration
 *
 * Usage:
 *   npx tsx scripts/run-better-auth-migration.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { Pool } from 'pg'

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    console.log('\nMake sure you have DATABASE_URL in your .env.local file')
    process.exit(1)
  }

  // Find the latest better-auth migration file
  const migrationDir = join(process.cwd(), 'better-auth_migrations')
  const migrationFiles = require('fs')
    .readdirSync(migrationDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort()
    .reverse() // Get the latest one

  if (migrationFiles.length === 0) {
    console.error('❌ No migration files found in better-auth_migrations/')
    process.exit(1)
  }

  const latestMigration = migrationFiles[0]
  const migrationPath = join(migrationDir, latestMigration)
  const sql = readFileSync(migrationPath, 'utf-8')

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl:
      process.env.NODE_ENV === 'production'
        ? { rejectUnauthorized: false }
        : false,
  })

  try {
    console.log(`🔄 Running migration: ${latestMigration}`)
    await pool.query(sql)
    console.log('✅ Migration completed successfully!')
    console.log('\nYou can now restart your dev server.')
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log(
        'ℹ️  Tables already exist. Migration may have already been run.'
      )
    } else {
      console.error('❌ Migration failed:', error.message)
      console.error('\nFull error:', error)
      process.exit(1)
    }
  } finally {
    await pool.end()
  }
}

runMigration()
