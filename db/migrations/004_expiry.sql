CREATE FUNCTION app_private.expire_and_purge()
RETURNS TABLE (expired_count integer, purged_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE changed integer;
DECLARE removed integer;
BEGIN
  UPDATE public.albums SET status = 'EXPIRED', updated_at = now()
  WHERE status <> 'EXPIRED' AND expires_at <= now();
  GET DIAGNOSTICS changed = ROW_COUNT;

  DELETE FROM public.albums WHERE expires_at <= now() - interval '30 days';
  GET DIAGNOSTICS removed = ROW_COUNT;

  RETURN QUERY SELECT changed, removed;
END
$$;

REVOKE ALL ON FUNCTION app_private.expire_and_purge() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.expire_and_purge() TO app_runtime;
