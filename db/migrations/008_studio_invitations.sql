CREATE TABLE studio_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'member', 'retoucher')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX studio_invitations_studio_idx ON studio_invitations (studio_id, created_at DESC);

CREATE FUNCTION app_private.user_email() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(lower(current_setting('app.user_email', true)), '')
$$;
CREATE FUNCTION app_private.invitation_hash() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.invitation_hash', true), '')
$$;
CREATE FUNCTION app_private.member_role(target uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT role FROM public.studio_members
  WHERE studio_id = target AND user_id = app_private.user_id()
$$;

REVOKE ALL ON FUNCTION app_private.user_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.invitation_hash() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_private.member_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.user_email(), app_private.invitation_hash(), app_private.member_role(uuid) TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_invitations TO app_runtime;
ALTER TABLE studio_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY studio_invitations_manager_read ON studio_invitations FOR SELECT TO app_runtime
  USING (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) IN ('owner', 'manager'));
CREATE POLICY studio_invitations_token_read ON studio_invitations FOR SELECT TO app_runtime
  USING (app_private.scope() = 'invitation_accept' AND token_hash = app_private.invitation_hash()
    AND email = app_private.user_email() AND revoked_at IS NULL AND expires_at > now());
CREATE POLICY studio_invitations_manager_insert ON studio_invitations FOR INSERT TO app_runtime
  WITH CHECK (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) IN ('owner', 'manager')
    AND (role <> 'manager' OR app_private.member_role(studio_id) = 'owner'));
CREATE POLICY studio_invitations_manager_update ON studio_invitations FOR UPDATE TO app_runtime
  USING (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) IN ('owner', 'manager'))
  WITH CHECK (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) IN ('owner', 'manager'));
CREATE POLICY studio_invitations_accept_update ON studio_invitations FOR UPDATE TO app_runtime
  USING (app_private.scope() = 'invitation_accept' AND token_hash = app_private.invitation_hash()
    AND email = app_private.user_email() AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now())
  WITH CHECK (app_private.scope() = 'invitation_accept' AND token_hash = app_private.invitation_hash()
    AND email = app_private.user_email() AND revoked_at IS NULL);

DROP POLICY studio_members_access ON studio_members;
DROP POLICY studio_members_self_read ON studio_members;
CREATE POLICY studio_members_read ON studio_members FOR SELECT TO app_runtime
  USING (studio_id = app_private.studio_id() OR user_id = app_private.user_id());
CREATE POLICY studio_members_bootstrap_insert ON studio_members FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'bootstrap' AND studio_id = app_private.studio_id()
    AND user_id = app_private.user_id() AND role = 'owner');
CREATE POLICY studio_members_invitation_insert ON studio_members FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'invitation_accept' AND user_id = app_private.user_id()
    AND EXISTS (SELECT 1 FROM studio_invitations i WHERE i.studio_id = studio_members.studio_id
      AND i.token_hash = app_private.invitation_hash() AND i.email = app_private.user_email()
      AND i.role = studio_members.role AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > now()));
CREATE POLICY studio_members_owner_update ON studio_members FOR UPDATE TO app_runtime
  USING (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) = 'owner' AND role <> 'owner')
  WITH CHECK (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) = 'owner' AND role <> 'owner');
CREATE POLICY studio_members_owner_delete ON studio_members FOR DELETE TO app_runtime
  USING (studio_id = app_private.studio_id() AND app_private.member_role(studio_id) = 'owner' AND role <> 'owner');
