CREATE FUNCTION app_private.reject_guest_studio_move()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF app_private.scope() = 'guest_admin' AND OLD.studio_id IS DISTINCT FROM NEW.studio_id THEN
    RAISE EXCEPTION 'Guest admin cannot change album studio' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER albums_guest_studio_guard
BEFORE UPDATE OF studio_id ON public.albums
FOR EACH ROW EXECUTE FUNCTION app_private.reject_guest_studio_move();
