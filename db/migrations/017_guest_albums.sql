ALTER TABLE studios ADD COLUMN guest_only boolean NOT NULL DEFAULT false;

CREATE POLICY studios_guest_insert ON studios FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'guest_admin' AND guest_only AND owner_user_id IS NULL
    AND id = NULLIF(current_setting('app.studio_id', true), '')::uuid
    AND app_private.album_id() IS NOT NULL);

CREATE POLICY audit_logs_guest_insert ON audit_logs FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'guest_admin' AND album_id = app_private.album_id()
    AND actor_kind = 'guest_admin'
    AND EXISTS (SELECT 1 FROM albums a WHERE a.id = album_id AND a.studio_id = audit_logs.studio_id));

CREATE POLICY album_settings_guest_read ON album_settings FOR SELECT TO app_runtime
  USING (app_private.scope() = 'guest_admin' AND album_id = app_private.album_id()
    AND app_private.album_readable(album_id));

CREATE TABLE guest_create_limits (
  address_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL,
  PRIMARY KEY (address_hash, window_start)
);
CREATE INDEX guest_create_limits_window_idx ON guest_create_limits (window_start);
REVOKE ALL ON guest_create_limits FROM PUBLIC;

CREATE FUNCTION app_private.consume_guest_create_attempt(supplied_hash text)
RETURNS TABLE (allowed boolean, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_window timestamptz := date_trunc('hour', now());
DECLARE current_attempts integer;
BEGIN
  IF supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid address hash' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.guest_create_limits WHERE window_start < now() - interval '2 days';
  INSERT INTO public.guest_create_limits (address_hash, window_start, attempts)
  VALUES (supplied_hash, current_window, 1)
  ON CONFLICT (address_hash, window_start)
  DO UPDATE SET attempts = public.guest_create_limits.attempts + 1
  RETURNING attempts INTO current_attempts;
  RETURN QUERY SELECT current_attempts <= 10,
    greatest(1, ceil(extract(epoch FROM current_window + interval '1 hour' - now()))::integer);
END
$$;
REVOKE ALL ON FUNCTION app_private.consume_guest_create_attempt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.consume_guest_create_attempt(text) TO app_runtime;

CREATE FUNCTION app_private.claim_guest_album(target_album uuid, supplied_hash text, target_studio uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source_studio uuid;
BEGIN
  IF app_private.user_id() IS NULL OR app_private.studio_id() IS DISTINCT FROM target_studio THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.studios s WHERE s.id = target_studio AND s.owner_user_id = app_private.user_id()) THEN
    RETURN false;
  END IF;
  SELECT a.studio_id INTO source_studio
  FROM public.albums a JOIN public.studios s ON s.id = a.studio_id
  WHERE a.id = target_album AND s.guest_only AND s.owner_user_id IS NULL
    AND a.expires_at > now() - interval '30 days'
  FOR UPDATE OF a;
  IF source_studio IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.album_tokens t WHERE t.album_id = target_album
      AND t.scope = 'guest_admin' AND t.token_hash = supplied_hash
      AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())
  ) THEN
    RETURN false;
  END IF;
  UPDATE public.albums SET studio_id = target_studio, updated_at = now() WHERE id = target_album;
  UPDATE public.audit_logs SET studio_id = target_studio WHERE album_id = target_album;
  UPDATE public.album_tokens SET revoked_at = now() WHERE album_id = target_album AND scope = 'guest_admin';
  DELETE FROM public.studios WHERE id = source_studio;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION app_private.claim_guest_album(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.claim_guest_album(uuid, text, uuid) TO app_runtime;

CREATE OR REPLACE FUNCTION app_private.expire_and_purge()
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

  DELETE FROM public.studios s WHERE s.guest_only AND NOT EXISTS (
    SELECT 1 FROM public.albums a WHERE a.studio_id = s.id
  );

  RETURN QUERY SELECT changed, removed;
END
$$;
