ALTER TABLE review_rounds ADD COLUMN drive_url text;
ALTER TABLE review_rounds ADD COLUMN selection_version_id uuid REFERENCES selection_versions(id) ON DELETE RESTRICT;
ALTER TABLE deliveries ADD COLUMN selection_version_id uuid REFERENCES selection_versions(id) ON DELETE RESTRICT;

CREATE POLICY revision_requests_customer_insert ON revision_requests FOR INSERT TO app_runtime
  WITH CHECK (album_id = app_private.album_id() AND app_private.album_readable(album_id)
    AND app_private.scope() IN ('customer', 'participant', 'finalizer')
    AND participant_id = app_private.participant_id()
    AND body <> '');

CREATE FUNCTION app_private.submit_review(target_album uuid, actor uuid, decision text, note_body text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE current_review public.review_rounds%ROWTYPE;
BEGIN
  IF target_album <> app_private.album_id()
    OR actor IS DISTINCT FROM app_private.participant_id()
    OR app_private.scope() NOT IN ('customer', 'participant', 'finalizer')
    OR NOT EXISTS (SELECT 1 FROM public.participants p WHERE p.id = actor AND p.album_id = target_album AND p.revoked_at IS NULL)
    OR NOT EXISTS (SELECT 1 FROM public.albums a WHERE a.id = target_album AND a.status = 'FINALIZED' AND a.expires_at > now())
  THEN RAISE EXCEPTION 'review access denied'; END IF;
  IF decision NOT IN ('approve', 'request_revision') THEN RAISE EXCEPTION 'invalid review decision'; END IF;
  IF decision = 'request_revision' AND (note_body IS NULL OR length(btrim(note_body)) = 0 OR length(note_body) > 5000)
  THEN RAISE EXCEPTION 'revision note required'; END IF;

  SELECT * INTO current_review FROM public.review_rounds
    WHERE album_id = target_album ORDER BY round_number DESC LIMIT 1 FOR UPDATE;
  IF current_review.id IS NULL OR current_review.status <> 'WAITING_REVIEW'
  THEN RAISE EXCEPTION 'review round is closed'; END IF;

  IF decision = 'approve' THEN
    UPDATE public.review_rounds SET status = 'APPROVED' WHERE id = current_review.id;
    UPDATE public.production_tasks t SET status = 'APPROVED', updated_at = now()
      FROM public.selection_version_items i
      WHERE t.selection_version_item_id = i.id AND i.selection_version_id = current_review.selection_version_id
        AND t.status = 'WAITING_REVIEW';
    RETURN 'APPROVED';
  END IF;
  INSERT INTO public.revision_requests (album_id, review_round_id, participant_id, body)
    VALUES (target_album, current_review.id, actor, btrim(note_body));
  UPDATE public.review_rounds SET status = 'REVISION_REQUESTED' WHERE id = current_review.id;
  UPDATE public.production_tasks t SET status = 'REVISION_REQUESTED', updated_at = now()
    FROM public.selection_version_items i
    WHERE t.selection_version_item_id = i.id AND i.selection_version_id = current_review.selection_version_id
      AND t.status = 'WAITING_REVIEW';
  RETURN 'REVISION_REQUESTED';
END $$;
REVOKE ALL ON FUNCTION app_private.submit_review(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.submit_review(uuid, uuid, text, text) TO app_runtime;
