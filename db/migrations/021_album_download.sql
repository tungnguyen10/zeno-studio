ALTER TABLE album_settings ADD COLUMN download_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE album_settings ADD COLUMN download_allow_single boolean NOT NULL DEFAULT true;
ALTER TABLE album_settings ADD COLUMN download_allow_selected boolean NOT NULL DEFAULT true;
ALTER TABLE album_settings ADD COLUMN download_allow_all boolean NOT NULL DEFAULT false;
ALTER TABLE album_settings ADD COLUMN download_available_when text NOT NULL DEFAULT 'anytime'
  CHECK (download_available_when IN ('anytime', 'after_finalize'));

ALTER TABLE photos ADD COLUMN source_size_bytes bigint CHECK (source_size_bytes >= 0);
ALTER TABLE photos ADD COLUMN source_md5_checksum text;
