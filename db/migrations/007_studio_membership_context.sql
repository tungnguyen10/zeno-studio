CREATE FUNCTION app_private.user_id() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.user_id', true), '')
$$;

CREATE OR REPLACE FUNCTION app_private.studio_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN app_private.scope() = 'bootstrap' THEN NULLIF(current_setting('app.studio_id', true), '')::uuid
    WHEN EXISTS (
      SELECT 1 FROM public.studio_members m
      WHERE m.studio_id = NULLIF(current_setting('app.studio_id', true), '')::uuid
        AND m.user_id = app_private.user_id()
    ) THEN NULLIF(current_setting('app.studio_id', true), '')::uuid
  END
$$;

REVOKE ALL ON FUNCTION app_private.user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.user_id() TO app_runtime;

CREATE POLICY studio_members_self_read ON studio_members FOR SELECT TO app_runtime
  USING (user_id = app_private.user_id());

CREATE UNIQUE INDEX studios_one_owner_idx ON studios (owner_user_id)
  WHERE owner_user_id IS NOT NULL;
