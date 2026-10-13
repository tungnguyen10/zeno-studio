CREATE TABLE studios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE studio_members (
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'member', 'retoucher')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (studio_id, user_id)
);

CREATE TABLE albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'FINALIZED', 'EXPIRED', 'DELIVERED')),
  expires_at timestamptz NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX albums_studio_status_idx ON albums (studio_id, status, updated_at DESC);

CREATE TABLE album_settings (
  album_id uuid PRIMARY KEY REFERENCES albums(id) ON DELETE CASCADE,
  limit_kind text NOT NULL DEFAULT 'unlimited' CHECK (limit_kind IN ('unlimited', 'exact', 'maximum', 'minimum', 'range')),
  limit_min integer CHECK (limit_min >= 0),
  limit_max integer CHECK (limit_max >= 0),
  collaboration_mode text NOT NULL DEFAULT 'shared' CHECK (collaboration_mode IN ('shared', 'individual', 'voting')),
  shortlist_rounds smallint NOT NULL DEFAULT 1 CHECK (shortlist_rounds IN (1, 2)),
  password_hash text,
  CHECK (limit_max IS NULL OR limit_min IS NULL OR limit_max >= limit_min)
);

CREATE TABLE drive_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  google_account_id text NOT NULL,
  encrypted_refresh_token bytea NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (studio_id, google_account_id)
);

CREATE TABLE photo_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('google_drive')),
  folder_id text NOT NULL,
  drive_connection_id uuid REFERENCES drive_connections(id) ON DELETE SET NULL,
  sync_status text NOT NULL DEFAULT 'PENDING' CHECK (sync_status IN ('PENDING', 'SYNCING', 'READY', 'ERROR')),
  last_sync_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES photo_sources(id) ON DELETE CASCADE,
  source_file_id text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  width integer,
  height integer,
  captured_at timestamptz,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'MISSING', 'BROKEN')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, source_file_id)
);
CREATE INDEX photos_album_order_idx ON photos (album_id, sort_order, id);

CREATE TABLE participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'participant' CHECK (role IN ('customer', 'participant', 'finalizer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE album_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('guest_admin', 'customer', 'participant', 'finalizer')),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX album_tokens_album_scope_idx ON album_tokens (album_id, scope);
