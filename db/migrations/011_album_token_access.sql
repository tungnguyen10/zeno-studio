CREATE FUNCTION app_private.resolve_album_token(supplied_hash text)
RETURNS TABLE (album_id uuid, participant_id uuid, access_scope text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.album_id, t.participant_id, t.scope
  FROM public.album_tokens t
  JOIN public.albums a ON a.id = t.album_id
  WHERE t.token_hash = supplied_hash
    AND t.revoked_at IS NULL
    AND (t.participant_id IS NULL OR EXISTS (
      SELECT 1 FROM public.participants p WHERE p.id = t.participant_id AND p.revoked_at IS NULL))
    AND (t.expires_at IS NULL OR t.expires_at > now())
    AND (
      (t.scope = 'guest_admin' AND a.expires_at > now() - interval '30 days')
      OR (t.scope IN ('customer', 'participant', 'finalizer')
        AND a.status IN ('PUBLISHED', 'FINALIZED', 'DELIVERED') AND a.expires_at > now())
    )
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION app_private.resolve_album_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.resolve_album_token(text) TO app_runtime;

CREATE FUNCTION app_private.album_public_settings(target uuid)
RETURNS TABLE (limit_kind text, limit_min integer, limit_max integer, collaboration_mode text, shortlist_rounds smallint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.limit_kind, s.limit_min, s.limit_max, s.collaboration_mode, s.shortlist_rounds
  FROM public.album_settings s
  WHERE s.album_id = target AND app_private.album_readable(target)
$$;
REVOKE ALL ON FUNCTION app_private.album_public_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.album_public_settings(uuid) TO app_runtime;

CREATE POLICY album_tokens_participant_insert ON album_tokens FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'customer' AND album_id = app_private.album_id()
    AND scope = 'customer' AND participant_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM participants p WHERE p.id = participant_id AND p.album_id = album_id));
