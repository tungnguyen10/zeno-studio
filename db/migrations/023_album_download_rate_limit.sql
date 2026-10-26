CREATE TABLE album_download_rate_windows (
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  address_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (album_id, address_hash, window_start)
);
CREATE INDEX album_download_rate_windows_age_idx ON album_download_rate_windows (window_start);
REVOKE ALL ON album_download_rate_windows FROM PUBLIC;

CREATE FUNCTION app_private.consume_album_download_attempt(target uuid, supplied_hash text)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_window timestamptz := date_trunc('hour', now());
DECLARE current_attempts integer;
BEGIN
  IF NOT app_private.album_readable(target) OR supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid download attempt' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.album_download_rate_windows WHERE window_start < now() - interval '2 days';
  INSERT INTO public.album_download_rate_windows (album_id, address_hash, window_start, attempts)
  VALUES (target, supplied_hash, current_window, 1)
  ON CONFLICT (album_id, address_hash, window_start)
  DO UPDATE SET attempts = public.album_download_rate_windows.attempts + 1
  RETURNING attempts INTO current_attempts;
  RETURN QUERY SELECT current_attempts <= 600,
    greatest(1, ceil(extract(epoch FROM current_window + interval '1 hour' - now()))::integer);
END
$$;
REVOKE ALL ON FUNCTION app_private.consume_album_download_attempt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.consume_album_download_attempt(uuid, text) TO app_runtime;
