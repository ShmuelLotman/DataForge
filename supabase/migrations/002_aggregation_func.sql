-- Aggregation function for charts
create or replace function get_aggregated_data(
  p_dataset_id uuid,
  p_x_axis text,
  p_y_axis text,
  p_group_by text,
  p_start_date timestamptz,
  p_end_date timestamptz,
  p_bucket text
)
returns table (
  x_value text,
  group_value text,
  y_value numeric
)
language plpgsql
as $$
declare
  v_sql text;
begin
  -- Basic validation to prevent injection (though format handles literals)
  -- We assume p_x_axis, p_y_axis, p_group_by are valid JSON keys
  
  v_sql := format(
    'select 
       date_trunc(%L, parsed_date)::text as x_value,
       coalesce(data->>%L, ''Total'') as group_value,
       sum((data->>%L)::numeric) as y_value
     from data_rows
     where dataset_id = %L
     and parsed_date >= %L
     and parsed_date <= %L
     group by 1, 2
     order by 1 asc',
    p_bucket,
    p_group_by,
    p_y_axis,
    p_dataset_id,
    p_start_date,
    p_end_date
  );

  return query execute v_sql;
end;
$$;
