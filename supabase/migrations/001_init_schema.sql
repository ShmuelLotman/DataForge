-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Datasets Table
create table datasets (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  canonical_schema jsonb, -- Array of {name, type, nullable}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Files Table
create table files (
  id uuid primary key default uuid_generate_v4(),
  dataset_id uuid references datasets(id) on delete cascade not null,
  original_filename text not null,
  display_name text,
  column_schema jsonb, -- Inferred schema for this specific file
  schema_fingerprint text,
  row_count int default 0,
  period_start timestamptz,
  period_end timestamptz,
  uploaded_at timestamptz default now()
);

create index idx_files_dataset_id on files(dataset_id);

-- 3. Data Rows Table (The Fact Table)
create table data_rows (
  id uuid primary key default uuid_generate_v4(),
  dataset_id uuid references datasets(id) on delete cascade not null,
  file_id uuid references files(id) on delete cascade not null,
  row_number int not null,
  parsed_date timestamptz, -- For time-series queries
  data jsonb not null -- The actual row data
);

-- Indexes for performance
create index idx_data_rows_dataset_date on data_rows(dataset_id, parsed_date);
create index idx_data_rows_file_id on data_rows(file_id);
create index idx_data_rows_data_gin on data_rows using gin (data);

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language 'plpgsql';

create trigger update_datasets_updated_at
before update on datasets
for each row
execute procedure update_updated_at_column();
