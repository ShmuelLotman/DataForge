export interface Dataset {
  id: string
  name: string
  description?: string
  canonicalSchema: ColumnSchema[] | null
  createdAt: Date
  updatedAt: Date
  fileCount: number
  rowCount: number
}

export interface ColumnSchema {
  id: string // Column identifier (same as name for now, but allows flexibility)
  label: string // Display name for UI
  type: 'string' | 'number' | 'date' | 'boolean'
  role: 'dimension' | 'metric' // Semantic role for visualization
  nullable?: boolean
}

export interface DataFile {
  id: string
  datasetId: string
  originalFilename: string
  displayName: string
  uploadedAt: Date
  columnSchema: ColumnSchema[]
  schemaFingerprint: string
  rowCount: number
  periodStart?: Date
  periodEnd?: Date
  tags?: string[]
}

export interface DataRow {
  id: string
  datasetId: string
  fileId: string
  rowNumber: number
  parsedDate?: Date
  data: Record<string, unknown>
}

export interface ParsedCSV {
  headers: string[]
  rows: Record<string, unknown>[]
  schema: ColumnSchema[]
  schemaFingerprint: string
}

export interface ChartConfig {
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter'
  xAxis: string
  yAxis: string[]
  groupBy?: string
  filters?: Record<string, unknown>
}
