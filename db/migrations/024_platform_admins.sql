CREATE TABLE platform_admins (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_admins_self_read ON platform_admins FOR SELECT TO app_runtime
  USING (user_id = app_private.user_id());
GRANT SELECT ON platform_admins TO app_runtime;
