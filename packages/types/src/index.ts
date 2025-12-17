// ============================================
// DATASET & FILES
// ============================================

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

// ============================================
// CHART CONFIGURATION
// ============================================

export type ChartType =
  | 'line'
  | 'bar'
  | 'area'
  | 'pie'
  | 'scatter'
  | 'kpi'
  | 'table'
export type AggregationType =
  | 'sum'
  | 'avg'
  | 'count'
  | 'count_distinct'
  | 'min'
  | 'max'
export type BucketType = 'day' | 'week' | 'month'

// All supported filter operators
export type FilterOperator =
  | 'eq'
  | 'neq' // equality
  | 'in'
  | 'not_in' // array membership
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'
  | 'between' // comparisons
  | 'contains'
  | 'starts_with' // string matching
  | 'is_null'
  | 'is_not_null' // null checks

// Type hint for filter comparisons
export type FilterValueType = 'string' | 'date' | 'number'

export interface ChartFilter {
  column: string
  op: FilterOperator
  value:
    | string
    | string[]
    | number
    | number[]
    | [string, string]
    | [number, number]
  type?: FilterValueType // Optional type hint for gte/lte/between
}

export interface ChartConfig {
  chartType: ChartType
  xAxis: string
  yAxis: string[]
  groupBy?: string | null
  aggregation?: AggregationType
  dateRange?: {
    start: string
    end: string
  } | null
  bucket?: BucketType | null
  filters?: ChartFilter[]
  // Chart-specific options
  stacked?: boolean // For bar charts
  layout?: 'vertical' | 'horizontal' // For bar charts
  format?: 'number' | 'currency' | 'percent' // For KPI display
  label?: string // For KPI display label
}

// Legacy ChartConfig for backwards compatibility
export interface LegacyChartConfig {
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter'
  xAxis: string
  yAxis: string[]
  groupBy?: string
  filters?: Record<string, unknown>
}

// ============================================
// DASHBOARD & PANELS
// ============================================

// UI-only configuration (not persisted to DB)
export interface DashboardLayoutConfig {
  columns: 1 | 2 | 3 | 4 // Number of columns in grid
  rowHeight: number // Row height in pixels
  gap: number // Gap between panels in pixels
}

// Default layout settings
export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayoutConfig = {
  columns: 2,
  rowHeight: 300,
  gap: 16,
}

export interface DashboardPanel {
  id: string
  dashboardId: string
  datasetId: string // Each panel can reference a different dataset
  title: string
  config: ChartConfig
  sortOrder: number // Simple ordering (panels render in this order)
  createdAt: Date
  updatedAt: Date
}

// Panel with its dataset info included (for rendering)
export interface DashboardPanelWithDataset extends DashboardPanel {
  dataset: {
    id: string
    name: string
    canonicalSchema: ColumnSchema[] | null
  }
}

export interface Dashboard {
  id: string
  userId: string
  datasetId?: string | null // Optional default dataset (legacy, kept for backwards compat)
  name: string
  description?: string
  defaultFilters?: ChartFilter[] // Global filters applied to all panels
  createdAt: Date
  updatedAt: Date
}

// Dashboard with all panels included
export interface DashboardWithPanels extends Dashboard {
  panels: DashboardPanelWithDataset[]
}

// Dashboard with dataset info (for list views)
export interface DashboardWithDataset extends Dashboard {
  dataset: {
    id: string
    name: string
    rowCount: number
  } | null
  panelCount: number
}

// Filter preset for quick filter switching
export interface DashboardFilterPreset {
  id: string
  dashboardId: string
  name: string
  filters: ChartFilter[]
  isDefault: boolean
  createdAt: Date
  updatedAt: Date
}

// ============================================
// AI CHAT TYPES
// ============================================

export interface AIChatSession {
  id: string
  userId: string
  datasetId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AIChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  toolCalls?: ToolCallResult[]
  chartConfig?: ChartConfig | null
  createdAt: Date
}

export interface ToolCallResult {
  toolName: string
  args: Record<string, unknown>
  result: unknown
}

// ============================================
// AI TOOL SCHEMAS
// ============================================

// The chart config generated by AI tools
export interface AIChartConfig {
  chartType: ChartType
  xAxis: string
  yAxis: string[]
  groupBy?: string | null
  bucket?: BucketType | null
  dateRange?: {
    start: string
    end: string
  } | null
  aggregation?: AggregationType
  title?: string
  filters?: ChartFilter[]
  stacked?: boolean
  layout?: 'vertical' | 'horizontal'
  format?: 'number' | 'currency' | 'percent'
  label?: string
}

// Context retrieved via RAG
export interface RAGContext {
  content: string
  contentType: 'schema' | 'sample' | 'description' | 'statistics'
  metadata: Record<string, unknown>
  similarity: number
}
