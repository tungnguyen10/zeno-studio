-- One shared customer participant per album: every device using the customer link resolves to it.
CREATE FUNCTION app_private.join_shared_participant(
  target_album uuid,
  target_token_hash text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  shared_participant uuid;
BEGIN
  IF app_private.scope() IS DISTINCT FROM 'customer'
    OR app_private.participant_id() IS NOT NULL
    OR app_private.album_id() IS DISTINCT FROM target_album
    OR NOT app_private.album_readable(target_album) THEN
    RETURN NULL;
  END IF;

  -- Serializes first visits so two devices cannot create two shared participants.
  PERFORM pg_advisory_xact_lock(hashtextextended(target_album::text, 0));

  SELECT id INTO shared_participant FROM public.participants
  WHERE album_id = target_album AND role = 'customer' AND revoked_at IS NULL
  ORDER BY created_at, id LIMIT 1;

  IF shared_participant IS NULL THEN
    INSERT INTO public.participants (album_id, display_name, role)
    VALUES (target_album, 'Khách', 'customer') RETURNING id INTO shared_participant;
  END IF;

  INSERT INTO public.album_tokens (album_id, participant_id, scope, token_hash)
  VALUES (target_album, shared_participant, 'customer', target_token_hash);
  RETURN shared_participant;
END;
$$;

REVOKE ALL ON FUNCTION app_private.join_shared_participant(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.join_shared_participant(uuid, text) TO app_runtime;

-- Individual/voting albums had no shared list; every open round now needs one.
INSERT INTO selection_lists (album_id, round_id, kind)
SELECT r.album_id, r.id, 'shared' FROM selection_rounds r
WHERE r.status = 'OPEN' AND NOT EXISTS (SELECT 1 FROM selection_lists l WHERE l.round_id = r.id AND l.kind = 'shared');
