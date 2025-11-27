import Papa from 'papaparse'
import type { ColumnSchema } from './types'
import { Readable } from 'stream'

export async function processCSV(
  fileStream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
  onBatch: (
    rows: Record<string, unknown>[],
    schema: ColumnSchema[]
  ) => Promise<void>,
  batchSize = 1000
): Promise<{
  schema: ColumnSchema[]
  rowCount: number
  schemaFingerprint: string
}> {
  return new Promise((resolve, reject) => {
    let schema: ColumnSchema[] | null = null
    let rowCount = 0
    let buffer: Record<string, unknown>[] = []

    // Convert Web Stream to Node Stream if necessary
    const stream = isWebStream(fileStream)
      ? Readable.fromWeb(fileStream as any)
      : fileStream

    Papa.parse(stream as any, {
      header: true,
      skipEmptyLines: true,
      chunk: async (results, parser) => {
        parser.pause()

        try {
          const chunkRows = results.data as Record<string, string>[]

          // Process rows (clean and type cast)
          const processedRows = chunkRows.map((row) => {
            const newRow: Record<string, unknown> = {}
            for (const [key, value] of Object.entries(row)) {
              newRow[key.trim()] = parseValue(value)
            }
            return newRow
          })

          if (!schema) {
            // Infer schema from the first batch
            const headers =
              results.meta.fields || Object.keys(processedRows[0] || {})
            schema = inferSchema(headers, processedRows)
          }

          buffer.push(...processedRows)
          rowCount += processedRows.length

          if (buffer.length >= batchSize) {
            await onBatch(buffer, schema!)
            buffer = []
          }

          parser.resume()
        } catch (err) {
          parser.abort()
          reject(err)
        }
      },
      complete: async () => {
        try {
          if (buffer.length > 0 && schema) {
            await onBatch(buffer, schema)
          }

          if (!schema) {
            // Empty file or failed to infer
            schema = []
          }

          resolve({
            schema,
            rowCount,
            schemaFingerprint: generateSchemaFingerprint(schema),
          })
        } catch (err) {
          reject(err)
        }
      },
      error: (error) => reject(error),
    })
  })
}

function isWebStream(stream: any): boolean {
  return stream && typeof stream.getReader === 'function'
}

function parseValue(value: string): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()

  if (trimmed === '' || /^null|n\/a$/i.test(trimmed)) return null
  if (/^true$/i.test(trimmed)) return true
  if (/^false$/i.test(trimmed)) return false

  // Date (Check BEFORE numbers to avoid parsing dates as numbers)
  if (
    /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(trimmed) ||
    /^\d{4}-\d{2}-\d{2}/.test(trimmed)
  ) {
    const date = new Date(trimmed)
    if (!isNaN(date.getTime())) return date.toISOString()
  }

  // Currency / Accounting: ($1,234.56) or -$1,234.56
  if (/^[$(]/.test(trimmed) || /^-?\$[\d,]+/.test(trimmed)) {
    let clean = trimmed.replace(/[$,]/g, '')
    if (clean.startsWith('(') && clean.endsWith(')')) {
      clean = '-' + clean.slice(1, -1)
    }
    const num = parseFloat(clean)
    if (!isNaN(num)) return num
  }

  // Percentage
  if (trimmed.endsWith('%')) {
    const num = parseFloat(trimmed.slice(0, -1))
    if (!isNaN(num)) return num / 100
  }

  // Number (plain numbers without $ or %)
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== '') return num

  return trimmed
}

function inferSchema(
  headers: string[],
  rows: Record<string, unknown>[]
): ColumnSchema[] {
  return headers.map((header) => {
    let type: ColumnSchema['type'] = 'string'
    let nullable = false
    const counts = { number: 0, boolean: 0, date: 0, string: 0 }

    const sample = rows.slice(0, 100)
    for (const row of sample) {
      const val = row[header]
      if (val === null) {
        nullable = true
        continue
      }
      if (typeof val === 'number') counts.number++
      else if (typeof val === 'boolean') counts.boolean++
      else if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(val))
        counts.date++
      else counts.string++
    }

    const max = Math.max(
      counts.number,
      counts.boolean,
      counts.date,
      counts.string
    )
    if (max > 0) {
      if (counts.number === max) type = 'number'
      else if (counts.boolean === max) type = 'boolean'
      else if (counts.date === max) type = 'date'
    }

    // Infer role
    let role: ColumnSchema['role'] = 'dimension'
    if (type === 'number') {
      role = 'metric'
    }

    return {
      id: header,
      label: formatLabel(header),
      type,
      role,
      nullable,
    }
  })
}

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1') // split camelCase
    .replace(/[_-]/g, ' ') // split snake_case
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) // Title Case
}

function generateSchemaFingerprint(schema: ColumnSchema[]): string {
  const str = schema.map((c) => `${c.id}:${c.type}`).join('|')
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16)
}

// Keep legacy export if needed, or remove
export function parseCSV(content: string) {
  throw new Error('Use processCSV for streaming')
}

export function validateSchemaCompatibility(
  newSchema: ColumnSchema[],
  canonicalSchema: ColumnSchema[]
): { compatible: boolean; differences: string[] } {
  const differences: string[] = []
  const canonicalMap = new Map(canonicalSchema.map((c) => [c.id, c.type]))

  for (const col of newSchema) {
    if (canonicalMap.has(col.id)) {
      const canonicalType = canonicalMap.get(col.id)
      if (canonicalType !== col.type) {
        differences.push(
          `Type mismatch for ${col.id}: expected ${canonicalType}, got ${col.type}`
        )
      }
    }
  }

  return {
    compatible: differences.length === 0,
    differences,
  }
}
