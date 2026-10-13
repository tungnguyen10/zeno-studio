CREATE OR REPLACE FUNCTION app_private.studio_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.studio_members m
    WHERE m.studio_id = NULLIF(current_setting('app.studio_id', true), '')::uuid
      AND m.user_id = app_private.user_id()
  ) OR (
    app_private.scope() = 'bootstrap' AND EXISTS (
      SELECT 1 FROM public.studios s
      WHERE s.id = NULLIF(current_setting('app.studio_id', true), '')::uuid
        AND s.owner_user_id = app_private.user_id()
    )
  ) THEN NULLIF(current_setting('app.studio_id', true), '')::uuid END
$$;

DROP POLICY studios_write ON studios;
CREATE POLICY studios_bootstrap_insert ON studios FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'bootstrap'
    AND id = NULLIF(current_setting('app.studio_id', true), '')::uuid
    AND owner_user_id = app_private.user_id());
CREATE POLICY studios_member_update ON studios FOR UPDATE TO app_runtime
  USING (id = app_private.studio_id() AND app_private.member_role(id) IN ('owner', 'manager'))
  WITH CHECK (id = app_private.studio_id() AND app_private.member_role(id) IN ('owner', 'manager'));
CREATE POLICY studios_owner_delete ON studios FOR DELETE TO app_runtime
  USING (id = app_private.studio_id() AND app_private.member_role(id) = 'owner');
