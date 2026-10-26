CREATE FUNCTION app_private.album_download_settings(target uuid)
RETURNS TABLE (
  download_enabled boolean,
  download_allow_single boolean,
  download_allow_selected boolean,
  download_allow_all boolean,
  download_available_when text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.download_enabled, s.download_allow_single, s.download_allow_selected,
    s.download_allow_all, s.download_available_when
  FROM public.album_settings s
  WHERE s.album_id = target AND app_private.album_readable(target)
$$;

REVOKE ALL ON FUNCTION app_private.album_download_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.album_download_settings(uuid) TO app_runtime;
