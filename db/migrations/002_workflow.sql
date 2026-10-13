CREATE TABLE selection_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  round_number smallint NOT NULL CHECK (round_number IN (1, 2)),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  UNIQUE (album_id, round_number)
);

CREATE TABLE selection_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES selection_rounds(id) ON DELETE CASCADE,
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('shared', 'individual', 'final')),
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX selection_lists_album_kind_idx ON selection_lists (album_id, kind);

CREATE TABLE selections (
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  list_id uuid NOT NULL REFERENCES selection_lists(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  selected_by uuid REFERENCES participants(id) ON DELETE SET NULL,
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, photo_id)
);
CREATE INDEX selections_album_photo_idx ON selections (album_id, photo_id);

CREATE TABLE photo_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (photo_id, participant_id)
);

CREATE TABLE photo_note_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  note_id uuid NOT NULL REFERENCES photo_notes(id) ON DELETE CASCADE,
  version integer NOT NULL,
  body text NOT NULL,
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, version)
);

CREATE TABLE selection_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  finalized_by uuid REFERENCES participants(id) ON DELETE SET NULL,
  finalized_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, version_number)
);

CREATE TABLE selection_version_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  selection_version_id uuid NOT NULL REFERENCES selection_versions(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE RESTRICT,
  filename text NOT NULL,
  notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (selection_version_id, photo_id)
);

CREATE TABLE production_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  selection_version_item_id uuid NOT NULL REFERENCES selection_version_items(id) ON DELETE CASCADE,
  assigned_user_id text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RETOUCHING', 'WAITING_REVIEW', 'APPROVED', 'REVISION_REQUESTED', 'DELIVERED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (selection_version_item_id)
);

CREATE TABLE review_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  round_number integer NOT NULL,
  drive_folder_id text,
  status text NOT NULL DEFAULT 'PREPARING' CHECK (status IN ('PREPARING', 'WAITING_REVIEW', 'APPROVED', 'REVISION_REQUESTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (album_id, round_number)
);

CREATE TABLE revision_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  review_round_id uuid NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  photo_id uuid REFERENCES photos(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES participants(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  review_round_id uuid REFERENCES review_rounds(id) ON DELETE SET NULL,
  drive_url text NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE album_daily_stats (
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0,
  selections integer NOT NULL DEFAULT 0,
  notes integer NOT NULL DEFAULT 0,
  PRIMARY KEY (album_id, day)
);

CREATE TABLE analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid REFERENCES albums(id) ON DELETE CASCADE,
  event_name text NOT NULL,
  session_hash text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_created_idx ON analytics_events (created_at);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id uuid NOT NULL REFERENCES studios(id) ON DELETE CASCADE,
  album_id uuid REFERENCES albums(id) ON DELETE SET NULL,
  actor_kind text NOT NULL,
  actor_id text,
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
