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

// ============================================
// TABLE CONFIGURATION
// ============================================

/**
 * Format hints for table columns
 */
export type TableColumnFormat = 'number' | 'currency' | 'percent' | 'date' | 'text'

/**
 * Configuration for a single table column
 */
export interface TableColumnConfig {
  /** Column ID from schema */
  id: string
  /** Aggregation type (only for metrics in aggregated mode) */
  aggregation?: AggregationType
  /** Display format hint */
  format?: TableColumnFormat
}

/**
 * Table-specific configuration for flexible table views
 * Supports both raw data views and aggregated summary tables
 */
export interface TableConfig {
  /** Table mode: 'raw' shows all rows, 'aggregated' groups by dimensions */
  mode: 'raw' | 'aggregated'
  /** Columns to display (order matters for display) */
  columns: TableColumnConfig[]
  /** For aggregated mode: dimension columns to group by */
  groupBy?: string[]
}

// Derived column types that can be computed from date columns at query time
export type DerivedColumnType =
  | 'day_of_week' // 0-6 (Sunday=0)
  | 'day_of_week_name' // Monday, Tuesday, etc.
  | 'day_of_week_short' // Mon, Tue, etc.
  | 'month' // 1-12
  | 'month_name' // January, February, etc.
  | 'month_short' // Jan, Feb, etc.
  | 'quarter' // 1-4
  | 'quarter_label' // Q1, Q2, Q3, Q4
  | 'year' // 4-digit year
  | 'week_of_year' // 1-53
  | 'day_of_month' // 1-31
  | 'hour' // 0-23
  | 'date_only' // strips time component
  | 'year_month' // YYYY-MM format

// ============================================
// MULTI-DATASET BLENDING
// ============================================

/**
 * How to blend data from multiple datasets:
 * - 'aggregate': Merge rows by key and sum metrics (e.g., total sales across stores)
 * - 'separate': Keep rows separate, add _source column (e.g., stacked bar by store)
 */
export type BlendMode = 'aggregate' | 'separate'

/**
 * Normalization mode for percentage calculations:
 * - 'none': Raw values
 * - 'row': Each row sums to 100% (100% stacked bar)
 * - 'all': All values sum to 100% (share of total)
 */
export type NormalizationMode = 'none' | 'row' | 'all'

/**
 * Configuration for multi-dataset panels
 */
export interface MultiDatasetConfig {
  /** All dataset IDs involved (primary first) */
  datasetIds: string[]
  /** How to blend the datasets */
  blendMode: BlendMode
  /** Normalization mode for percentages */
  normalizeTo?: NormalizationMode
}

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
  // Derived X-axis (e.g., Day of Week computed from Date column)
  xAxisDerived?: DerivedColumnType | null
  xAxisSourceColumn?: string | null // The date column to derive from
  // Chart-specific options
  stacked?: boolean // For bar charts
  layout?: 'vertical' | 'horizontal' // For bar charts
  format?: 'number' | 'currency' | 'percent' // For KPI display
  label?: string // For KPI display label
  // Top N / Sorting options
  limit?: number // e.g., 10 for "Top 10"
  sortBy?: {
    column: string // Which metric to sort by
    direction: 'asc' | 'desc' // desc for "top", asc for "bottom"
  }
  // Donut chart (pie with inner radius)
  innerRadius?: number // 0 = pie, 40-60 = donut
  // Dual Y-axis support
  yAxisRight?: string[] // Metrics to plot on right axis
  // Data labels on bars/segments
  showDataLabels?: boolean // Display values on chart elements

  // ============================================
  // Table-specific configuration
  // ============================================
  /** Table configuration (only used when chartType === 'table') */
  tableConfig?: TableConfig

  // ============================================
  // Multi-dataset blending options
  // ============================================
  /** Dataset IDs for multi-dataset panels (primary first) */
  datasetIds?: string[]
  /**
   * How to blend multiple datasets:
   * - 'aggregate': Merge by key, sum metrics (total across sources)
   * - 'separate': Keep separate, add _source column (breakdown by source)
   */
  blendMode?: BlendMode
  /** Normalize values to percentages */
  normalizeTo?: NormalizationMode
}

export const DERIVED_LABELS: Record<DerivedColumnType, string> = {
  day_of_week: 'Day of Week (0-6)',
  day_of_week_name: 'Day of Week (name)',
  day_of_week_short: 'Day of Week (short)',
  month: 'Month (1-12)',
  month_name: 'Month (name)',
  month_short: 'Month (short)',
  quarter: 'Quarter (1-4)',
  quarter_label: 'Quarter (label)',
  year: 'Year',
  week_of_year: 'Week of Year',
  day_of_month: 'Day of Month',
  hour: 'Hour',
  date_only: 'Date',
  year_month: 'Year-Month',
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
  datasetIds?: string[] // Optional additional datasets (primary first)
}

// Panel with its dataset info included (for rendering)
export interface DashboardPanelWithDataset extends DashboardPanel {
  dataset: {
    id: string
    name: string
    canonicalSchema: ColumnSchema[] | null
  }
  datasetIds?: string[]
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
  // Top N / Sorting options
  limit?: number
  sortBy?: {
    column: string
    direction: 'asc' | 'desc'
  }
  // Donut chart
  innerRadius?: number
  // Dual Y-axis
  yAxisRight?: string[]
  // Data labels on bars/segments
  showDataLabels?: boolean
  // Multi-dataset options
  datasetIds?: string[]
  blendMode?: BlendMode
  normalizeTo?: NormalizationMode
  // Table configuration
  tableConfig?: TableConfig
}

// Context retrieved via RAG
export interface RAGContext {
  content: string
  contentType: 'schema' | 'sample' | 'description' | 'statistics'
  metadata: Record<string, unknown>
  similarity: number
}
