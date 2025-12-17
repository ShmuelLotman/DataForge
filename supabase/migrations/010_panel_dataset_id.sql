-- Migration: 010_panel_dataset_id.sql
-- Allow panels to reference different datasets (multi-dataset dashboards)

-- ============================================
-- ADD DATASET_ID TO PANELS
-- ============================================

-- Add dataset_id column to dashboard_panels
-- This allows each panel to reference its own dataset
ALTER TABLE dashboard_panels
ADD COLUMN dataset_id uuid REFERENCES datasets(id) ON DELETE CASCADE;

-- Backfill existing panels with their dashboard's dataset_id
UPDATE dashboard_panels dp
SET dataset_id = d.dataset_id
FROM dashboards d
WHERE dp.dashboard_id = d.id
AND dp.dataset_id IS NULL;

-- Now make it NOT NULL after backfill
ALTER TABLE dashboard_panels
ALTER COLUMN dataset_id SET NOT NULL;

-- Add index for efficient lookups
CREATE INDEX idx_dashboard_panels_dataset_id ON dashboard_panels(dataset_id);

-- ============================================
-- MAKE DASHBOARD DATASET_ID OPTIONAL
-- ============================================
-- The dashboard's dataset_id becomes optional (nullable)
-- It can serve as a "default" dataset for new panels, but is no longer required

ALTER TABLE dashboards
ALTER COLUMN dataset_id DROP NOT NULL;

-- Add a comment explaining the new schema
COMMENT ON COLUMN dashboard_panels.dataset_id IS 'The dataset this panel queries data from. Each panel can use a different dataset.';
COMMENT ON COLUMN dashboards.dataset_id IS 'Optional default dataset for new panels. Legacy field kept for backwards compatibility.';

