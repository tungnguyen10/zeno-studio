ALTER TABLE album_settings ADD COLUMN duration_days smallint NOT NULL DEFAULT 15
  CHECK (duration_days IN (15, 30));
ALTER TABLE photo_sources ADD COLUMN resource_key text;
ALTER TABLE photos ADD COLUMN resource_key text;
