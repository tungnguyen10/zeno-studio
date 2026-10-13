DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime NOLOGIN;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS app_private;

CREATE FUNCTION app_private.studio_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.studio_id', true), '')::uuid
$$;

CREATE FUNCTION app_private.album_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.album_id', true), '')::uuid
$$;

CREATE FUNCTION app_private.scope() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.scope', true), '')
$$;

CREATE FUNCTION app_private.album_readable(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.albums a WHERE a.id = target AND (
      a.studio_id = app_private.studio_id()
      OR (a.id = app_private.album_id() AND (
        (app_private.scope() = 'guest_admin' AND a.expires_at > now() - interval '30 days')
        OR (app_private.scope() IN ('customer', 'participant', 'finalizer')
          AND a.status NOT IN ('DRAFT', 'EXPIRED') AND a.expires_at > now())
      ))
    )
  )
$$;

CREATE FUNCTION app_private.album_editable(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.albums a WHERE a.id = target AND (
      a.studio_id = app_private.studio_id()
      OR (a.id = app_private.album_id() AND app_private.scope() = 'guest_admin'
        AND a.status <> 'EXPIRED' AND a.expires_at > now())
    )
  )
$$;

CREATE FUNCTION app_private.album_participatable(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_private.album_editable(target) OR (
    target = app_private.album_id()
    AND app_private.scope() IN ('customer', 'participant', 'finalizer')
    AND app_private.album_readable(target)
  )
$$;

CREATE FUNCTION app_private.album_finalizable(target uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT app_private.album_editable(target) OR (
    target = app_private.album_id()
    AND app_private.scope() = 'finalizer'
    AND app_private.album_readable(target)
  )
$$;

REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO app_runtime;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app_private TO app_runtime;

ALTER TABLE studios ENABLE ROW LEVEL SECURITY;
CREATE POLICY studios_read ON studios FOR SELECT TO app_runtime USING (id = app_private.studio_id());
CREATE POLICY studios_write ON studios FOR ALL TO app_runtime
  USING (id = app_private.studio_id())
  WITH CHECK (id = app_private.studio_id() OR app_private.scope() = 'bootstrap');

ALTER TABLE studio_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY studio_members_access ON studio_members FOR ALL TO app_runtime
  USING (studio_id = app_private.studio_id())
  WITH CHECK (studio_id = app_private.studio_id());

ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
CREATE POLICY albums_read ON albums FOR SELECT TO app_runtime USING (app_private.album_readable(id));
CREATE POLICY albums_write ON albums FOR ALL TO app_runtime
  USING (app_private.album_editable(id))
  WITH CHECK (studio_id = app_private.studio_id() OR (id = app_private.album_id() AND app_private.scope() = 'guest_admin'));

ALTER TABLE drive_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY drive_connections_access ON drive_connections FOR ALL TO app_runtime
  USING (studio_id = app_private.studio_id())
  WITH CHECK (studio_id = app_private.studio_id());

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_logs_access ON audit_logs FOR ALL TO app_runtime
  USING (studio_id = app_private.studio_id())
  WITH CHECK (studio_id = app_private.studio_id());

DO $policies$
DECLARE table_name text;
DECLARE read_rule text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'album_settings', 'photo_sources', 'photos', 'album_tokens',
    'production_tasks', 'review_rounds', 'revision_requests', 'deliveries', 'album_daily_stats'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    read_rule := CASE WHEN table_name IN ('photos', 'review_rounds', 'deliveries')
      THEN 'app_private.album_readable(album_id)'
      ELSE 'app_private.album_editable(album_id)' END;
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_runtime USING (%s)', table_name || '_read', table_name, read_rule);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO app_runtime USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id))', table_name || '_write', table_name);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'participants', 'selection_rounds', 'selection_lists', 'selections', 'photo_notes', 'photo_note_revisions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_runtime USING (app_private.album_readable(album_id))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO app_runtime USING (app_private.album_participatable(album_id)) WITH CHECK (app_private.album_participatable(album_id))', table_name || '_write', table_name);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY['selection_versions', 'selection_version_items'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO app_runtime USING (app_private.album_readable(album_id))', table_name || '_read', table_name);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO app_runtime WITH CHECK (app_private.album_finalizable(album_id))', table_name || '_insert', table_name);
  END LOOP;
END $policies$;

ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_events_read ON analytics_events FOR SELECT TO app_runtime
  USING (album_id IS NOT NULL AND app_private.album_editable(album_id));
CREATE POLICY analytics_events_insert ON analytics_events FOR INSERT TO app_runtime
  WITH CHECK ((album_id IS NOT NULL AND app_private.album_readable(album_id)) OR (album_id IS NULL AND app_private.scope() = 'product_event'));

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON "user", session, account, verification TO app_runtime;
DO $grants$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'studios', 'studio_members', 'albums', 'album_settings', 'drive_connections',
    'photo_sources', 'photos', 'participants', 'album_tokens', 'selection_rounds',
    'selection_lists', 'selections', 'photo_notes', 'photo_note_revisions',
    'selection_versions', 'selection_version_items', 'production_tasks', 'review_rounds',
    'revision_requests', 'deliveries', 'album_daily_stats', 'analytics_events', 'audit_logs'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO app_runtime', table_name);
  END LOOP;
END $grants$;
