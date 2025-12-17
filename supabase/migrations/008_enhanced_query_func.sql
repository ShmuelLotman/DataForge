-- Migration: 008_enhanced_query_func.sql
-- Enhances query_dataset function with:
--   1. Additional filter operators: gte, lte, between, neq, not_in
--   2. count_distinct aggregation for metrics like unique ticket count
--   3. Better type handling for date/numeric comparisons
--   4. Derived columns computed at query time (day_of_week, month_name, etc.)

-- ============================================
-- HELPER: Get derived column SQL expression
-- ============================================
-- Returns the SQL expression for a derived column based on derivation type
create or replace function get_derived_column_expr(
  p_derivation text,
  p_source_column text
)
returns text
language plpgsql
immutable
as $$
begin
  case p_derivation
    -- Day of week as number (0=Sunday, 6=Saturday in PostgreSQL)
    when 'day_of_week' then
      return format('EXTRACT(dow FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Day of week as name (Monday, Tuesday, etc.)
    when 'day_of_week_name' then
      return format('to_char((data->>%L)::timestamp, ''Day'')', p_source_column);
    
    -- Day of week as short name (Mon, Tue, etc.)
    when 'day_of_week_short' then
      return format('to_char((data->>%L)::timestamp, ''Dy'')', p_source_column);
    
    -- Month as number (1-12)
    when 'month' then
      return format('EXTRACT(month FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Month as name (January, February, etc.)
    when 'month_name' then
      return format('to_char((data->>%L)::timestamp, ''Month'')', p_source_column);
    
    -- Month as short name (Jan, Feb, etc.)
    when 'month_short' then
      return format('to_char((data->>%L)::timestamp, ''Mon'')', p_source_column);
    
    -- Quarter (1-4)
    when 'quarter' then
      return format('EXTRACT(quarter FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Quarter as label (Q1, Q2, Q3, Q4)
    when 'quarter_label' then
      return format('''Q'' || EXTRACT(quarter FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Year
    when 'year' then
      return format('EXTRACT(year FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Week of year (1-53)
    when 'week_of_year' then
      return format('EXTRACT(week FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Day of month (1-31)
    when 'day_of_month' then
      return format('EXTRACT(day FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Hour (0-23)
    when 'hour' then
      return format('EXTRACT(hour FROM (data->>%L)::timestamp)::int', p_source_column);
    
    -- Date only (strips time)
    when 'date_only' then
      return format('((data->>%L)::timestamp)::date', p_source_column);
    
    -- Year-Month (YYYY-MM)
    when 'year_month' then
      return format('to_char((data->>%L)::timestamp, ''YYYY-MM'')', p_source_column);
    
    else
      -- Unknown derivation, return null
      return 'NULL';
  end case;
end;
$$;

-- ============================================
-- MAIN: Enhanced query_dataset function
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
  
begin
  -- 1. Parse X Axis (with derived column support)
  v_x_col := p_config->'x'->>'column';
  v_x_bucket := p_config->'x'->>'bucket';
  v_x_derived := p_config->'x'->>'derived';  -- e.g., 'day_of_week_name'
  v_x_source := p_config->'x'->>'sourceColumn';  -- source column for derivation
  
  -- Determine X Expression
  if v_x_derived is not null and v_x_source is not null then
    -- Use derived column expression
    v_x_expr := get_derived_column_expr(v_x_derived, v_x_source);
  elsif v_x_bucket is not null and v_x_bucket != 'none' then
    -- Use date bucketing
    v_x_expr := format('date_trunc(%L, (data->>%L)::timestamp)', v_x_bucket, v_x_col);
  else
    -- Use raw column value
    v_x_expr := format('data->>%L', v_x_col);
  end if;
  
  -- 2. Start Building SELECT list with X
  v_select := format('jsonb_build_object(%L, %s', v_x_col, v_x_expr);
  
  -- 3. Add Y Axis (Aggregations)
  for v_y_elem in select * from jsonb_array_elements(p_config->'y')
  loop
    v_y_col := v_y_elem->>'column';
    v_y_agg := coalesce(v_y_elem->>'agg', v_y_elem->>'aggregation', 'sum');
    
    if v_y_agg = 'count' then
      v_select := v_select || format(', %L, count(*)', v_y_col);
    elsif v_y_agg = 'count_distinct' then
      -- COUNT DISTINCT for unique values (e.g., unique ticket IDs)
      v_select := v_select || format(', %L, count(distinct data->>%L)', v_y_col, v_y_col);
    else
      -- sum, avg, min, max - safe cast to numeric
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
      
      -- Determine group expression (derived or raw)
      if v_group_derived is not null and v_group_source is not null then
        v_group_expr := get_derived_column_expr(v_group_derived, v_group_source);
      else
        v_group_expr := format('data->>%L', v_group_col);
      end if;
      
      -- Add to SELECT
      v_select := v_select || format(', %L, %s', v_group_col, v_group_expr);
      -- Add to GROUP BY array
      v_group_parts := array_append(v_group_parts, v_group_expr);
    end loop;
  end if;
  
  -- Close SELECT object
  v_select := v_select || ')';
  
  -- 5. Build WHERE clause with enhanced filter operators
  v_where_parts := array[format('dataset_id = %L', p_dataset_id)];
  
  if p_config->'filters' is not null then
    for v_filter_elem in select * from jsonb_array_elements(p_config->'filters')
    loop
      v_filter_col := v_filter_elem->>'column';
      v_filter_op := v_filter_elem->>'op';
      v_filter_val := v_filter_elem->'value';
      -- Optional type hint: 'date', 'number', 'string' (defaults to string)
      v_filter_type := coalesce(v_filter_elem->>'type', 'string');
      
      -- Equality operators
      if v_filter_op = 'eq' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L = %L', v_filter_col, v_filter_val#>>'{}'));
      
      elsif v_filter_op = 'neq' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L != %L', v_filter_col, v_filter_val#>>'{}'));
      
      -- Array membership operators
      elsif v_filter_op = 'in' then
        -- Check if data->>col is in the provided array
        v_where_parts := array_append(v_where_parts, 
          format('%L::jsonb ? (data->>%L)', v_filter_val, v_filter_col));
      
      elsif v_filter_op = 'not_in' then
        v_where_parts := array_append(v_where_parts, 
          format('NOT (%L::jsonb ? (data->>%L))', v_filter_val, v_filter_col));
      
      -- Comparison operators (date/numeric)
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
        -- value should be an array [start, end]
        if v_filter_type = 'date' then
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::timestamp BETWEEN %L::timestamp AND %L::timestamp', 
              v_filter_col, v_filter_val->>0, v_filter_val->>1));
        else
          v_where_parts := array_append(v_where_parts, 
            format('(data->>%L)::numeric BETWEEN %s AND %s', 
              v_filter_col, v_filter_val->>0, v_filter_val->>1));
        end if;
      
      -- String operators
      elsif v_filter_op = 'contains' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L ILIKE %L', v_filter_col, '%' || (v_filter_val#>>'{}') || '%'));
      
      elsif v_filter_op = 'starts_with' then
        v_where_parts := array_append(v_where_parts, 
          format('data->>%L ILIKE %L', v_filter_col, (v_filter_val#>>'{}') || '%'));
      
      -- Null checks
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
  
  -- 6. Build Final GROUP BY string
  if array_length(v_group_parts, 1) > 0 then
    v_group_by := v_x_expr || ', ' || array_to_string(v_group_parts, ', ');
  else
    v_group_by := v_x_expr;
  end if;
  
  -- 7. Execute
  v_sql := format('
    SELECT %s
    FROM data_rows
    WHERE %s
    GROUP BY %s
    ORDER BY 1 ASC
  ', v_select, v_where, v_group_by);
  
  return query execute v_sql;
end;
$$;

-- Add comment documenting the enhanced features
comment on function query_dataset(uuid, jsonb) is 
'Generic dataset query function with aggregation, filtering, and derived columns.

Config structure:
{
  "x": { 
    "column": "Date",                    -- column name (or alias for derived)
    "bucket": "day|week|month|none",     -- optional date bucketing
    "derived": "day_of_week_name",       -- optional derivation type
    "sourceColumn": "Day"                -- required if using derived
  },
  "y": [{ "column": "Sales", "agg": "sum|avg|count|count_distinct|min|max" }],
  "groupBy": [{ 
    "column": "DOW_Name",                -- column name (or alias for derived)
    "derived": "day_of_week_name",       -- optional derivation type
    "sourceColumn": "Day"                -- required if using derived
  }],
  "filters": [{
    "column": "Date",
    "op": "eq|neq|in|not_in|gte|lte|gt|lt|between|contains|starts_with|is_null|is_not_null",
    "value": "...",
    "type": "string|date|number"
  }]
}

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
- gte, lte, gt, lt: comparisons (use type:"date" or type:"number")
- between: range (value is [start, end] array)
- contains, starts_with: string matching (case-insensitive)
- is_null, is_not_null: null checks
';

-- Document the helper function
comment on function get_derived_column_expr(text, text) is 
'Returns SQL expression for derived columns computed from date fields.
Used internally by query_dataset for on-the-fly column derivation.';

