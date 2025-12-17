-- Migration: 009_dashboard_filters.sql
-- Adds default_filters column to dashboards for global filter persistence
-- Filters are stored as JSONB array and can be overridden via URL params

-- ============================================
-- ADD DEFAULT FILTERS TO DASHBOARDS
-- ============================================

ALTER TABLE dashboards 
ADD COLUMN IF NOT EXISTS default_filters jsonb DEFAULT '[]'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN dashboards.default_filters IS 
'Default filters applied to all panels in this dashboard.
Structure: Array of filter objects
[
  {
    "column": "Store",           -- Column to filter on
    "op": "in",                  -- Filter operator (eq, in, gte, lte, between, etc.)
    "value": ["MO", "BP"],       -- Filter value(s)
    "type": "string"             -- Optional type hint for comparisons
  },
  {
    "column": "Day",
    "op": "between",
    "value": ["2024-01-01", "2024-12-31"],
    "type": "date"
  }
]

These filters are merged with panel-specific filters at query time.
URL parameters can override these defaults for shareable filtered views.';

-- ============================================
-- ADD FILTER PRESETS TABLE (OPTIONAL)
-- ============================================
-- Allows users to save named filter combinations for quick access

CREATE TABLE IF NOT EXISTS dashboard_filter_presets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  dashboard_id uuid NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_filter_presets_dashboard_id 
ON dashboard_filter_presets(dashboard_id);

-- Unique constraint: only one default preset per dashboard
CREATE UNIQUE INDEX IF NOT EXISTS idx_filter_presets_default 
ON dashboard_filter_presets(dashboard_id) 
WHERE is_default = true;

-- Update trigger (drop first if exists to make migration idempotent)
DROP TRIGGER IF EXISTS update_filter_presets_updated_at ON dashboard_filter_presets;
CREATE TRIGGER update_filter_presets_updated_at
BEFORE UPDATE ON dashboard_filter_presets
FOR EACH ROW
EXECUTE PROCEDURE update_updated_at_column();

COMMENT ON TABLE dashboard_filter_presets IS 
'Named filter presets for dashboards. Users can save commonly used filter combinations.
Example presets: "Last 30 Days", "Q4 2024", "Manhattan Stores Only"';

-- ============================================
-- HELPER: Get distinct column values
-- ============================================
-- Efficiently retrieves unique values for a column in a dataset
-- Used to populate filter dropdowns

CREATE OR REPLACE FUNCTION get_column_distinct_values(
  p_dataset_id uuid,
  p_column_name text,
  p_limit int DEFAULT 1000
)
RETURNS TABLE(value text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT data->>p_column_name AS value
  FROM data_rows
  WHERE dataset_id = p_dataset_id
    AND data->>p_column_name IS NOT NULL
    AND data->>p_column_name != ''
  ORDER BY value
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION get_column_distinct_values(uuid, text, int) IS 
'Returns distinct values for a column in a dataset. Used for filter dropdowns.';


