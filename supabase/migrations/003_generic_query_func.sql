-- Generic Query Function for Datasets
-- Accepts a JSON configuration for X, Y, GroupBy, and Filters
-- Returns a set of JSONB objects representing the aggregated data

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
  v_x_expr text;
  
  v_y_elem jsonb;
  v_y_col text;
  v_y_agg text;
  
  v_group_elem jsonb;
  v_group_col text;
  v_group_parts text[];
  
  v_filter_elem jsonb;
  v_filter_col text;
  v_filter_op text;
  v_filter_val jsonb;
  v_where_parts text[];
  
begin
  -- 1. Parse X Axis
  v_x_col := p_config->'x'->>'column';
  v_x_bucket := p_config->'x'->>'bucket';
  
  -- Determine X Expression
  -- We use data->>col and cast to timestamp if bucket is present
  if v_x_bucket is not null and v_x_bucket != 'none' then
    v_x_expr := format('date_trunc(%L, (data->>%L)::timestamp)', v_x_bucket, v_x_col);
  else
    v_x_expr := format('data->>%L', v_x_col);
  end if;
  
  -- 2. Start Building SELECT list with X
  v_select := format('jsonb_build_object(%L, %s', v_x_col, v_x_expr);
  
  -- 3. Add Y Axis (Aggregations)
  for v_y_elem in select * from jsonb_array_elements(p_config->'y')
  loop
     v_y_col := v_y_elem->>'column';
     v_y_agg := v_y_elem->>'agg';
     
     if v_y_agg = 'count' then
       v_select := v_select || format(', %L, count(*)', v_y_col);
     else
       -- safe cast to numeric
       v_select := v_select || format(', %L, %s((data->>%L)::numeric)', v_y_col, v_y_agg, v_y_col);
     end if;
  end loop;
  
  -- 4. Add Group By Columns to SELECT and GROUP BY list
  v_group_parts := array[]::text[];
  if p_config->'groupBy' is not null and jsonb_array_length(p_config->'groupBy') > 0 then
    for v_group_elem in select * from jsonb_array_elements(p_config->'groupBy')
    loop
      v_group_col := v_group_elem->>'column';
      -- Add to SELECT
      v_select := v_select || format(', %L, data->>%L', v_group_col, v_group_col);
      -- Add to GROUP BY array
      v_group_parts := array_append(v_group_parts, format('data->>%L', v_group_col));
    end loop;
  end if;
  
  -- Close SELECT object
  v_select := v_select || ')';
  
  -- 5. Build WHERE
  v_where_parts := array[format('dataset_id = %L', p_dataset_id)];
  
  if p_config->'filters' is not null then
    for v_filter_elem in select * from jsonb_array_elements(p_config->'filters')
    loop
      v_filter_col := v_filter_elem->>'column';
      v_filter_op := v_filter_elem->>'op';
      v_filter_val := v_filter_elem->'value';
      
      if v_filter_op = 'eq' then
         -- Handle string vs number? assume string for JSONB ->> 
         -- If value is number, cast? 
         -- For simplicity, treat everything as text equality from JSON
         v_where_parts := array_append(v_where_parts, format('data->>%L = %L', v_filter_col, v_filter_val->>0));
      elsif v_filter_op = 'in' then
         -- Check if value (array) contains data->>col
         v_where_parts := array_append(v_where_parts, format('%L::jsonb ? (data->>%L)', v_filter_val, v_filter_col));
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

