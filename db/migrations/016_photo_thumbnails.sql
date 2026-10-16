ALTER TABLE photos
  ADD COLUMN thumbnail_url text,
  ADD COLUMN thumbnail_checked_at timestamptz;

-- Customer album access can refresh only thumbnail metadata, without broad photo write access.
CREATE FUNCTION app_private.set_photo_thumbnail_cache(
  target_photo uuid,
  target_album uuid,
  thumbnail_link text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT app_private.album_readable(target_album) THEN
    RETURN false;
  END IF;

  UPDATE public.photos
  SET thumbnail_url = thumbnail_link, thumbnail_checked_at = now()
  WHERE id = target_photo AND album_id = target_album;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION app_private.set_photo_thumbnail_cache(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.set_photo_thumbnail_cache(uuid, uuid, text) TO app_runtime;
