-- Migration: 013_kpi_aggregate_only.sql
-- Adds support for KPI-style queries that return a single aggregated value
-- without grouping by any dimension (x-axis).
--
-- New config option:
--   "aggregateOnly": true  -- Returns single row with just aggregated metrics

-- ============================================
-- MAIN: Enhanced query_dataset with aggregateOnly support
-- ============================================
create or replace function query_dataset(
  p_dataset_id uuid,
  p_config jsonb
)
returns setof jsonb
language plpgsql
as $$
declare
  v_sql text;
  v_select text;
  v_group_by text;
  v_where text;
  v_order_by text;
  v_limit_clause text;
  
  v_x_col text;
  v_x_bucket text;
  v_x_derived text;
  v_x_source text;
  v_x_expr text;
  
  v_y_elem jsonb;
  v_y_col text;
  v_y_agg text;
  
  v_group_elem jsonb;
  v_group_col text;
  v_group_derived text;
  v_group_source text;
  v_group_expr text;
  v_group_parts text[];
  
  v_filter_elem jsonb;
  v_filter_col text;
  v_filter_op text;
  v_filter_val jsonb;
  v_filter_type text;
  v_where_parts text[];
  
  -- ORDER BY and LIMIT
  v_sort_column text;
  v_sort_direction text;
  v_limit_value int;
  
  -- NEW: aggregateOnly mode for KPI
  v_aggregate_only boolean;
  
begin
  -- Check for aggregateOnly mode (KPI-style single-value aggregation)
  v_aggregate_only := coalesce((p_config->>'aggregateOnly')::boolean, false);
  
  -- 1. Parse X Axis (with derived column support)
  -- Skip if aggregateOnly mode
  v_x_col := p_config->'x'->>'column';
  v_x_bucket := p_config->'x'->>'bucket';
  v_x_derived := p_config->'x'->>'derived';
  v_x_source := p_config->'x'->>'sourceColumn';
  
  -- Determine X Expression (only needed if not aggregateOnly)
  if not v_aggregate_only then
    if v_x_derived is not null and v_x_source is not null then
      v_x_expr := get_derived_column_expr(v_x_derived, v_x_source);
    elsif v_x_bucket is not null and v_x_bucket != 'none' then
      v_x_expr := format('date_trunc(%L, (data->>%L)::timestamp)', v_x_bucket, v_x_col);
    else
      v_x_expr := format('data->>%L', v_x_col);
    end if;
  end if;
  
  -- 2. Start Building SELECT list
  if v_aggregate_only then
    -- For aggregateOnly, start with just the aggregations (no x-axis)
    v_select := 'jsonb_build_object(';
    declare
      v_first_y boolean := true;
    begin
      for v_y_elem in select * from jsonb_array_elements(p_config->'y')
      loop
        v_y_col := v_y_elem->>'column';
        v_y_agg := coalesce(v_y_elem->>'agg', v_y_elem->>'aggregation', 'sum');
        
        if not v_first_y then
          v_select := v_select || ', ';
        end if;
        v_first_y := false;
        
        if v_y_agg = 'count' then
          v_select := v_select || format('%L, count(*)', v_y_col);
        elsif v_y_agg = 'count_distinct' then
          v_select := v_select || format('%L, count(distinct data->>%L)', v_y_col, v_y_col);
        else
          v_select := v_select || format('%L, %s((data->>%L)::numeric)', v_y_col, v_y_agg, v_y_col);
        end if;
      end loop;
    end;
    v_select := v_select || ')';
  else
    -- Standard mode: include x-axis
    v_select := format('jsonb_build_object(%L, %s', v_x_col, v_x_expr);
    
    -- 3. Add Y Axis (Aggregations)
    for v_y_elem in select * from jsonb_array_elements(p_config->'y')
    loop
      v_y_col := v_y_elem->>'column';
      v_y_agg := coalesce(v_y_elem->>'agg', v_y_elem->>'aggregation', 'sum');
      
      if v_y_agg = 'count' then
        v_select := v_select || format(', %L, count(*)', v_y_col);
      elsif v_y_agg = 'count_distinct' then
        v_select := v_select || format(', %L, count(distinct data->>%L)', v_y_col, v_y_col);
      else
        v_select := v_select || format(', %L, %s((data->>%L)::numeric)', v_y_col, v_y_agg, v_y_col);
      end if;
    end loop;
    
    -- 4. Add Group By Columns to SELECT and GROUP BY list (with derived column support)
    v_group_parts := array[]::text[];
    if p_config->'groupBy' is not null and jsonb_array_length(p_config->'groupBy') > 0 then
      for v_group_elem in select * from jsonb_array_elements(p_config->'groupBy')
      loop
        v_group_col := v_group_elem->>'column';
        v_group_derived := v_group_elem->>'derived';
        v_group_source := v_group_elem->>'sourceColumn';
        
        if v_group_derived is not null and v_group_source is not null then
          v_group_expr := get_derived_column_expr(v_group_derived, v_group_source);
        else
          v_group_expr := format('data->>%L', v_group_col);
        end if;
        
        v_select := v_select || format(', %L, %s', v_group_col, v_group_expr);
        v_group_parts := array_append(v_group_parts, v_group_expr);
      end loop;
    end if;
    
    v_select := v_select || ')';
  end if;
  
  -- 5. Build WHERE clause with enhanced filter operators
  v_where_parts := array[format('dataset_id = %L', p_dataset_id)];
  
  if p_config->'filters' is not null then
    for v_filter_elem in select * from jsonb_array_elements(p_config->'filters')
    loop
      v_filter_col := v_filter_elem->>'column';
      v_filter_op := v_filter_elem->>'op';
      v_filter_val := v_filter_elem->'value';
      v_filter_type := coalesce(v_filter_elem->>'type', 'string');
      
      if v_filter_op = 'eq' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L = %L', v_filter_col, v_filter_val#>>'{}'));
      
      elsif v_filter_op = 'neq' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L != %L', v_filter_col, v_filter_val#>>'{}'));
      
      elsif v_filter_op = 'in' then
        v_where_parts := array_append(v_where_parts, 
          format('%L::jsonb ? (data->>%L)', v_filter_val, v_filter_col));
      
      elsif v_filter_op = 'not_in' then
        v_where_parts := array_append(v_where_parts, 
          format('NOT (%L::jsonb ? (data->>%L))', v_filter_val, v_filter_col));
      
      elsif v_filter_op = 'gte' then
        if v_filter_type = 'date' then
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::timestamp >= %L::timestamp', v_filter_col, v_filter_val#>>'{}'));
        else
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::numeric >= %s', v_filter_col, v_filter_val#>>'{}'));
        end if;
      
      elsif v_filter_op = 'lte' then
        if v_filter_type = 'date' then
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::timestamp <= %L::timestamp', v_filter_col, v_filter_val#>>'{}'));
        else
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::numeric <= %s', v_filter_col, v_filter_val#>>'{}'));
        end if;
      
      elsif v_filter_op = 'gt' then
        if v_filter_type = 'date' then
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::timestamp > %L::timestamp', v_filter_col, v_filter_val#>>'{}'));
        else
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::numeric > %s', v_filter_col, v_filter_val#>>'{}'));
        end if;
      
      elsif v_filter_op = 'lt' then
        if v_filter_type = 'date' then
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::timestamp < %L::timestamp', v_filter_col, v_filter_val#>>'{}'));
        else
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::numeric < %s', v_filter_col, v_filter_val#>>'{}'));
        end if;
      
      elsif v_filter_op = 'between' then
        if v_filter_type = 'date' then
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::timestamp BETWEEN %L::timestamp AND %L::timestamp', 
              v_filter_col, v_filter_val->>0, v_filter_val->>1));
        else
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::numeric BETWEEN %s AND %s', 
              v_filter_col, v_filter_val->>0, v_filter_val->>1));
        end if;
      
      elsif v_filter_op = 'contains' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L ILIKE %L', v_filter_col, '%' || (v_filter_val#>>'{}') || '%'));
      
      elsif v_filter_op = 'starts_with' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L ILIKE %L', v_filter_col, (v_filter_val#>>'{}') || '%'));
      
      elsif v_filter_op = 'is_null' then
        v_where_parts := array_append(v_where_parts, 
          format('(data->>%L IS NULL OR data->>%L = %L)', v_filter_col, v_filter_col, ''));
      
      elsif v_filter_op = 'is_not_null' then
        v_where_parts := array_append(v_where_parts, 
          format('(data->>%L IS NOT NULL AND data->>%L != %L)', v_filter_col, v_filter_col, ''));
      
      end if;
    end loop;
  end if;
  
  v_where := array_to_string(v_where_parts, ' AND ');
  
  -- 6. Build Final GROUP BY string (skip for aggregateOnly)
  if v_aggregate_only then
    v_group_by := null;
  elsif array_length(v_group_parts, 1) > 0 then
    v_group_by := v_x_expr || ', ' || array_to_string(v_group_parts, ', ');
  else
    v_group_by := v_x_expr;
  end if;
  
  -- 7. Build ORDER BY clause (skip for aggregateOnly - only one row)
  if v_aggregate_only then
    v_order_by := null;
  else
    v_sort_column := p_config->'sortBy'->>'column';
    v_sort_direction := coalesce(p_config->'sortBy'->>'direction', 'desc');
    
    if v_sort_column is not null then
      declare
        v_sort_agg text := 'sum';
        v_y_search jsonb;
      begin
        for v_y_search in select * from jsonb_array_elements(p_config->'y')
        loop
          if v_y_search->>'column' = v_sort_column then
            v_sort_agg := coalesce(v_y_search->>'agg', v_y_search->>'aggregation', 'sum');
            exit;
          end if;
        end loop;
        
        if v_sort_agg = 'count' then
          v_order_by := format('count(*) %s', v_sort_direction);
        elsif v_sort_agg = 'count_distinct' then
          v_order_by := format('count(distinct data->>%L) %s', v_sort_column, v_sort_direction);
        else
          v_order_by := format('%s((data->>%L)::numeric) %s', v_sort_agg, v_sort_column, v_sort_direction);
        end if;
      end;
    else
      v_order_by := '1 ASC';
    end if;
  end if;
  
  -- 8. Build LIMIT clause
  v_limit_value := (p_config->>'limit')::int;
  if v_limit_value is not null and v_limit_value > 0 then
    v_limit_clause := format('LIMIT %s', v_limit_value);
  else
    v_limit_clause := '';
  end if;
  
  -- 9. Execute
  if v_aggregate_only then
    -- No GROUP BY or ORDER BY for aggregateOnly
    v_sql := format('
      SELECT %s
      FROM data_rows
      WHERE %s
      %s
    ', v_select, v_where, v_limit_clause);
  else
    v_sql := format('
      SELECT %s
      FROM data_rows
      WHERE %s
      GROUP BY %s
      ORDER BY %s
      %s
    ', v_select, v_where, v_group_by, v_order_by, v_limit_clause);
  end if;
  
  return query execute v_sql;
end;
$$;

-- Update comment documenting the new aggregateOnly feature
comment on function query_dataset(uuid, jsonb) is 
'Generic dataset query function with aggregation, filtering, derived columns, LIMIT, ORDER BY, and KPI mode.

Config structure:
{
  "x": { 
    "column": "Date",                    -- column name (ignored if aggregateOnly)
    "bucket": "day|week|month|none",     -- optional date bucketing
    "derived": "day_of_week_name",       -- optional derivation type
    "sourceColumn": "Day"                -- required if using derived
  },
  "y": [{ "column": "Sales", "agg": "sum|avg|count|count_distinct|min|max" }],
  "groupBy": [{ 
    "column": "DOW_Name",                -- column name (ignored if aggregateOnly)
    "derived": "day_of_week_name",
    "sourceColumn": "Day"
  }],
  "filters": [{
    "column": "Date",
    "op": "eq|neq|in|not_in|gte|lte|gt|lt|between|contains|starts_with|is_null|is_not_null",
    "value": "...",
    "type": "string|date|number"
  }],
  "sortBy": {
    "column": "Sales",                   -- metric column to sort by
    "direction": "asc|desc"
  },
  "limit": 10,                           -- number of results
  "aggregateOnly": true                  -- NEW: KPI mode - single row with aggregated totals
}

KPI Mode (aggregateOnly: true):
- Returns a single row with aggregated metrics across all matching data
- Ignores x-axis and groupBy settings
- Perfect for KPI cards showing totals like "Total Sales: $1.2M"
- Filters still apply to narrow down the data before aggregation

Derived column types (computed from date columns):
- day_of_week: 0-6 (Sunday=0)
- day_of_week_name: Monday, Tuesday, etc.
- day_of_week_short: Mon, Tue, etc.
- month: 1-12
- month_name: January, February, etc.
- month_short: Jan, Feb, etc.
- quarter: 1-4
- quarter_label: Q1, Q2, Q3, Q4
- year: 4-digit year
- week_of_year: 1-53
- day_of_month: 1-31
- hour: 0-23
- date_only: strips time component
- year_month: YYYY-MM format

Filter operators:
- eq, neq: equality/inequality
- in, not_in: array membership
- gte, lte, gt, lt: comparisons
- between: range (value is [start, end] array)
- contains, starts_with: string matching (case-insensitive)
- is_null, is_not_null: null checks
';

