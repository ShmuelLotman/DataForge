#!/usr/bin/env node
/**
 * Run better-auth migration
 * Usage: node scripts/run-migration.mjs
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { Pool } from 'pg'
import { config } from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') })

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required')
    console.log(
      '\nPlease make sure DATABASE_URL is set in your .env.local file'
    )
    process.exit(1)
  }

  // Read the migration file
  const migrationPath = join(
    __dirname,
    '..',
    'better-auth_migrations',
    '2025-12-02T04-05-29.590Z.sql'
  )
  const sql = readFileSync(migrationPath, 'utf-8')

  console.log('🔄 Connecting to database...')
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase')
      ? { rejectUnauthorized: false }
      : false,
  })

  try {
    // Test connection
    await pool.query('SELECT NOW()')
    console.log('✅ Connected to database')

    console.log('🔄 Running migration...')
    await pool.query(sql)
    console.log('✅ Migration completed successfully!')
    console.log('\nTables created:')
    console.log('  - user')
    console.log('  - session')
    console.log('  - account')
    console.log('  - verification')
    console.log('\nYou can now restart your dev server.')
  } catch (error) {
    if (error.message?.includes('already exists')) {
      console.log('ℹ️  Some tables already exist. Checking which ones...')
      const result = await pool.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('user', 'session', 'account', 'verification')
      `)
      console.log(
        'Existing tables:',
        result.rows.map((r) => r.table_name).join(', ')
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

