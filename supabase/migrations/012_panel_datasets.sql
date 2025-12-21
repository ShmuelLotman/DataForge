-- Migration: 012_panel_datasets.sql
-- Introduce panel_datasets join table for one-to-many panel↔dataset mapping.
-- Keeps dashboard_panels.dataset_id as primary (for compatibility/indexing),
-- but allows multiple datasets per panel for blending at the DB layer later.

-- ============================================
-- TABLE: panel_datasets
-- ============================================
create table if not exists panel_datasets (
  panel_id uuid not null references dashboard_panels(id) on delete cascade,
  dataset_id uuid not null references datasets(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz default now(),
  primary key (panel_id, dataset_id)
);

create index if not exists idx_panel_datasets_dataset_id on panel_datasets(dataset_id);

-- Only one primary dataset per panel
create unique index if not exists uniq_panel_primary_dataset
  on panel_datasets(panel_id) where is_primary;

-- ============================================
-- BACKFILL FROM EXISTING PANELS
-- ============================================
insert into panel_datasets (panel_id, dataset_id, is_primary)
select id, dataset_id, true
from dashboard_panels
where dataset_id is not null
on conflict (panel_id, dataset_id) do nothing;

-- ============================================
-- NOTES
-- ============================================
-- dashboard_panels.dataset_id remains as the primary dataset anchor.
-- Future writes should keep dataset_id in sync with the primary row in panel_datasets.

