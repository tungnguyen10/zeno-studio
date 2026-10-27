CREATE TABLE studio_daily_metrics (
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  day date NOT NULL,
  albums_created integer NOT NULL DEFAULT 0 CHECK (albums_created >= 0),
  albums_published integer NOT NULL DEFAULT 0 CHECK (albums_published >= 0),
  selection_finalized integer NOT NULL DEFAULT 0 CHECK (selection_finalized >= 0),
  gallery_opens integer NOT NULL DEFAULT 0 CHECK (gallery_opens >= 0),
  file_match_runs integer NOT NULL DEFAULT 0 CHECK (file_match_runs >= 0),
  matched_count integer NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  missing_count integer NOT NULL DEFAULT 0 CHECK (missing_count >= 0),
  ambiguous_count integer NOT NULL DEFAULT 0 CHECK (ambiguous_count >= 0),
  PRIMARY KEY (studio_id, day)
);
CREATE TABLE album_analytics_open_rate (
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  minute timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (album_id, minute)
);
CREATE INDEX album_analytics_open_rate_minute_idx ON album_analytics_open_rate (minute);

ALTER TABLE studio_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_daily_metrics_owner_read ON studio_daily_metrics FOR SELECT TO app_runtime
  USING (studio_id = app_private.studio_id() AND EXISTS (
    SELECT 1 FROM studio_members m WHERE m.studio_id = studio_daily_metrics.studio_id
      AND m.user_id = app_private.user_id() AND m.role = 'owner'
  ));
ALTER TABLE album_analytics_open_rate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON studio_daily_metrics, album_analytics_open_rate FROM PUBLIC, app_runtime;
GRANT SELECT ON studio_daily_metrics TO app_runtime;

CREATE FUNCTION app_private.record_studio_metric(target_studio uuid, target_album uuid, metric text, amount integer DEFAULT 1)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF amount <> 1 OR metric NOT IN ('album_created', 'album_published', 'selection_finalized') OR NOT EXISTS (
    SELECT 1 FROM public.albums a WHERE a.id = target_album AND a.studio_id = target_studio
  ) OR NOT (
    (app_private.scope() = 'member' AND target_studio = app_private.studio_id()
      AND app_private.user_id() IS NOT NULL)
    OR (app_private.scope() = 'guest_admin' AND target_album = app_private.album_id()
      AND EXISTS (SELECT 1 FROM public.studios s WHERE s.id = target_studio AND s.guest_only))
  ) THEN RAISE EXCEPTION 'Analytics metric forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.studio_daily_metrics (studio_id, day, albums_created, albums_published, selection_finalized)
  VALUES (target_studio, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
    CASE WHEN metric = 'album_created' THEN 1 ELSE 0 END,
    CASE WHEN metric = 'album_published' THEN 1 ELSE 0 END,
    CASE WHEN metric = 'selection_finalized' THEN 1 ELSE 0 END)
  ON CONFLICT (studio_id, day) DO UPDATE SET
    albums_created = public.studio_daily_metrics.albums_created + EXCLUDED.albums_created,
    albums_published = public.studio_daily_metrics.albums_published + EXCLUDED.albums_published,
    selection_finalized = public.studio_daily_metrics.selection_finalized + EXCLUDED.selection_finalized;
END
$$;

CREATE FUNCTION app_private.record_gallery_open(target_album uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner_studio uuid; accepted integer;
BEGIN
  IF app_private.scope() NOT IN ('customer', 'participant', 'finalizer')
    OR target_album IS DISTINCT FROM app_private.album_id()
    OR NOT app_private.album_readable(target_album) THEN
    RAISE EXCEPTION 'Gallery access forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT studio_id INTO owner_studio FROM public.albums WHERE id = target_album;
  INSERT INTO public.album_analytics_open_rate (album_id, minute, request_count)
  VALUES (target_album, date_trunc('minute', now()), 1)
  ON CONFLICT (album_id, minute) DO UPDATE SET request_count = public.album_analytics_open_rate.request_count + 1
  RETURNING request_count INTO accepted;
  IF accepted > 120 THEN RAISE EXCEPTION 'Gallery rate exceeded' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.studio_daily_metrics (studio_id, day, gallery_opens)
  VALUES (owner_studio, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1)
  ON CONFLICT (studio_id, day) DO UPDATE SET gallery_opens = public.studio_daily_metrics.gallery_opens + 1;
  INSERT INTO public.album_daily_stats (album_id, day, views)
  VALUES (target_album, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1)
  ON CONFLICT (album_id, day) DO UPDATE SET views = public.album_daily_stats.views + 1;
END
$$;

CREATE FUNCTION app_private.record_file_match(target_album uuid, matched integer, missing integer, ambiguous integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE owner_studio uuid;
BEGIN
  IF matched IS NULL OR missing IS NULL OR ambiguous IS NULL
    OR matched NOT BETWEEN 0 AND 10000 OR missing NOT BETWEEN 0 AND 10000 OR ambiguous NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'Invalid file match totals' USING ERRCODE = '22023';
  END IF;
  SELECT a.studio_id INTO owner_studio FROM public.albums a WHERE a.id = target_album;
  IF owner_studio IS NULL OR NOT (
    (app_private.scope() = 'member' AND owner_studio = app_private.studio_id() AND app_private.user_id() IS NOT NULL)
    OR (app_private.scope() = 'guest_admin' AND target_album = app_private.album_id()
      AND app_private.album_readable(target_album))
  ) THEN RAISE EXCEPTION 'File match forbidden' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.studio_daily_metrics (studio_id, day, file_match_runs, matched_count, missing_count, ambiguous_count)
  VALUES (owner_studio, (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 1, matched, missing, ambiguous)
  ON CONFLICT (studio_id, day) DO UPDATE SET
    file_match_runs = public.studio_daily_metrics.file_match_runs + 1,
    matched_count = public.studio_daily_metrics.matched_count + EXCLUDED.matched_count,
    missing_count = public.studio_daily_metrics.missing_count + EXCLUDED.missing_count,
    ambiguous_count = public.studio_daily_metrics.ambiguous_count + EXCLUDED.ambiguous_count;
END
$$;

CREATE FUNCTION app_private.purge_studio_metrics()
RETURNS TABLE(metrics_deleted integer, rate_deleted integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE old_metrics integer; old_rates integer;
BEGIN
  DELETE FROM public.studio_daily_metrics WHERE day < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 120;
  GET DIAGNOSTICS old_metrics = ROW_COUNT;
  DELETE FROM public.album_analytics_open_rate WHERE minute < now() - interval '1 day';
  GET DIAGNOSTICS old_rates = ROW_COUNT;
  RETURN QUERY SELECT old_metrics, old_rates;
END
$$;

REVOKE ALL ON FUNCTION app_private.record_studio_metric(uuid, uuid, text, integer),
  app_private.record_gallery_open(uuid), app_private.record_file_match(uuid, integer, integer, integer),
  app_private.purge_studio_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.record_studio_metric(uuid, uuid, text, integer),
  app_private.record_gallery_open(uuid), app_private.record_file_match(uuid, integer, integer, integer)
  TO app_runtime;

INSERT INTO studio_daily_metrics (studio_id, day, albums_created, albums_published, selection_finalized)
SELECT studio_id, metric_day, sum(created_count)::integer, sum(published_count)::integer, sum(finalized_count)::integer
FROM (
  SELECT studio_id, (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS metric_day,
    1 AS created_count, 0 AS published_count, 0 AS finalized_count FROM albums
  UNION ALL
  SELECT studio_id, (published_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 0, 1, 0 FROM albums WHERE published_at IS NOT NULL
  UNION ALL
  SELECT a.studio_id, (v.finalized_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date, 0, 0, 1
    FROM selection_versions v JOIN albums a ON a.id = v.album_id
) history
WHERE metric_day >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 120
GROUP BY studio_id, metric_day;

CREATE OR REPLACE FUNCTION app_private.claim_guest_album(target_album uuid, supplied_hash text, target_studio uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE source_studio uuid;
BEGIN
  IF app_private.user_id() IS NULL OR app_private.studio_id() IS DISTINCT FROM target_studio THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.studios s WHERE s.id = target_studio AND s.owner_user_id = app_private.user_id()) THEN RETURN false; END IF;
  SELECT a.studio_id INTO source_studio
  FROM public.albums a JOIN public.studios s ON s.id = a.studio_id
  WHERE a.id = target_album AND s.guest_only AND s.owner_user_id IS NULL
    AND a.expires_at > now() - interval '30 days'
  FOR UPDATE OF a;
  IF source_studio IS NULL OR EXISTS (SELECT 1 FROM public.albums WHERE studio_id = source_studio AND id <> target_album)
    OR NOT EXISTS (
      SELECT 1 FROM public.album_tokens t WHERE t.album_id = target_album
        AND t.scope = 'guest_admin' AND t.token_hash = supplied_hash
        AND t.revoked_at IS NULL AND (t.expires_at IS NULL OR t.expires_at > now())
    ) THEN RETURN false; END IF;
  INSERT INTO public.studio_daily_metrics
    (studio_id, day, albums_created, albums_published, selection_finalized, gallery_opens,
     file_match_runs, matched_count, missing_count, ambiguous_count)
  SELECT target_studio, day, albums_created, albums_published, selection_finalized, gallery_opens,
    file_match_runs, matched_count, missing_count, ambiguous_count
  FROM public.studio_daily_metrics WHERE studio_id = source_studio
  ON CONFLICT (studio_id, day) DO UPDATE SET
    albums_created = public.studio_daily_metrics.albums_created + EXCLUDED.albums_created,
    albums_published = public.studio_daily_metrics.albums_published + EXCLUDED.albums_published,
    selection_finalized = public.studio_daily_metrics.selection_finalized + EXCLUDED.selection_finalized,
    gallery_opens = public.studio_daily_metrics.gallery_opens + EXCLUDED.gallery_opens,
    file_match_runs = public.studio_daily_metrics.file_match_runs + EXCLUDED.file_match_runs,
    matched_count = public.studio_daily_metrics.matched_count + EXCLUDED.matched_count,
    missing_count = public.studio_daily_metrics.missing_count + EXCLUDED.missing_count,
    ambiguous_count = public.studio_daily_metrics.ambiguous_count + EXCLUDED.ambiguous_count;
  UPDATE public.albums SET studio_id = target_studio, updated_at = now() WHERE id = target_album;
  UPDATE public.audit_logs SET studio_id = target_studio WHERE album_id = target_album;
  UPDATE public.album_tokens SET revoked_at = now() WHERE album_id = target_album AND scope = 'guest_admin';
  DELETE FROM public.studios WHERE id = source_studio;
  RETURN true;
END
$$;
REVOKE ALL ON FUNCTION app_private.claim_guest_album(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.claim_guest_album(uuid, text, uuid) TO app_runtime;
