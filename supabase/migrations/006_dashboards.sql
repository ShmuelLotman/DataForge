-- Migration: 006_dashboards.sql
-- Multi-panel dashboards feature

-- ============================================
-- DASHBOARDS TABLE
-- ============================================
-- A dashboard is a named container of panels, tied to ONE dataset
-- NOTE: Layout (columns, gaps, etc.) is a UI concern, not stored in DB
create table dashboards (
  id uuid primary key default uuid_generate_v4(),
  user_id text not null references "user"(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,

  -- Dashboard metadata
  name text not null,
  description text,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_dashboards_user_id on dashboards(user_id);
create index idx_dashboards_dataset_id on dashboards(dataset_id);

-- Update trigger
create trigger update_dashboards_updated_at
before update on dashboards
for each row
execute procedure update_updated_at_column();

-- ============================================
-- DASHBOARD PANELS TABLE
-- ============================================
-- Each panel is a single chart within a dashboard
-- Layout (columns, sizing) is handled in UI, not DB
create table dashboard_panels (
  id uuid primary key default uuid_generate_v4(),
  dashboard_id uuid not null references dashboards(id) on delete cascade,

  -- Panel metadata
  title text not null,

  -- Chart configuration
  config jsonb not null,
  -- config structure:
  -- {
  --   "chartType": "line" | "bar" | "area" | "pie" | "scatter" | "kpi",
  --   "xAxis": "column_id",
  --   "yAxis": ["column_id_1", "column_id_2"],
  --   "groupBy": "column_id" | null,
  --   "dateRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" } | null,
  --   "bucket": "day" | "week" | "month" | null,
  --   "filters": [{ "column": "...", "op": "...", "value": "..." }],
  --   "aggregation": "sum" | "avg" | "count" | "min" | "max"
  -- }

  -- Display order (panels render in this order, UI handles grid placement)
  sort_order int default 0,

  -- Timestamps
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_dashboard_panels_dashboard_id on dashboard_panels(dashboard_id);
create index idx_dashboard_panels_sort_order on dashboard_panels(dashboard_id, sort_order);

-- Update trigger
create trigger update_dashboard_panels_updated_at
before update on dashboard_panels
for each row
execute procedure update_updated_at_column();

