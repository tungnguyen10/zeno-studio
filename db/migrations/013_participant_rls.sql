CREATE FUNCTION app_private.participant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.participant_id', true), '')::uuid
$$;
GRANT EXECUTE ON FUNCTION app_private.participant_id() TO app_runtime;

DROP POLICY selection_rounds_write ON selection_rounds;
CREATE POLICY selection_rounds_write ON selection_rounds FOR ALL TO app_runtime
  USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id));

DROP POLICY participants_write ON participants;
CREATE POLICY participants_studio_write ON participants FOR ALL TO app_runtime
  USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id));
CREATE POLICY participants_customer_join ON participants FOR INSERT TO app_runtime
  WITH CHECK (app_private.scope() = 'customer' AND app_private.participant_id() IS NULL
    AND album_id = app_private.album_id() AND app_private.album_readable(album_id) AND role = 'customer');

DROP POLICY selection_lists_read ON selection_lists;
CREATE POLICY selection_lists_read ON selection_lists FOR SELECT TO app_runtime
  USING (app_private.album_readable(album_id) AND (
    app_private.album_editable(album_id) OR
    (app_private.participant_id() IS NOT NULL AND (kind = 'shared' OR participant_id = app_private.participant_id()))
  ));
DROP POLICY selection_lists_write ON selection_lists;
CREATE POLICY selection_lists_studio_write ON selection_lists FOR ALL TO app_runtime
  USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id));
CREATE POLICY selection_lists_participant_insert ON selection_lists FOR INSERT TO app_runtime
  WITH CHECK (app_private.album_participatable(album_id) AND app_private.participant_id() IS NOT NULL
    AND participant_id = app_private.participant_id() AND kind = 'individual');
CREATE POLICY selection_lists_participant_update ON selection_lists FOR UPDATE TO app_runtime
  USING (app_private.album_participatable(album_id) AND app_private.participant_id() IS NOT NULL
    AND (kind = 'shared' OR participant_id = app_private.participant_id()))
  WITH CHECK (app_private.album_participatable(album_id) AND app_private.participant_id() IS NOT NULL
    AND (kind = 'shared' OR participant_id = app_private.participant_id()));

DROP POLICY selections_read ON selections;
CREATE POLICY selections_read ON selections FOR SELECT TO app_runtime
  USING (app_private.album_readable(album_id) AND (
    app_private.album_editable(album_id) OR
    (app_private.participant_id() IS NOT NULL AND EXISTS (
      SELECT 1 FROM selection_lists l WHERE l.id = list_id
        AND (l.kind = 'shared' OR l.participant_id = app_private.participant_id())
    ))
  ));
DROP POLICY selections_write ON selections;
CREATE POLICY selections_studio_write ON selections FOR ALL TO app_runtime
  USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id));
CREATE POLICY selections_participant_insert ON selections FOR INSERT TO app_runtime
  WITH CHECK (app_private.album_participatable(album_id) AND selected_by = app_private.participant_id()
    AND EXISTS (SELECT 1 FROM selection_lists l WHERE l.id = list_id
      AND (l.kind = 'shared' OR l.participant_id = app_private.participant_id())));
CREATE POLICY selections_participant_delete ON selections FOR DELETE TO app_runtime
  USING (app_private.album_participatable(album_id) AND app_private.participant_id() IS NOT NULL
    AND EXISTS (SELECT 1 FROM selection_lists l WHERE l.id = list_id
      AND (l.kind = 'shared' OR l.participant_id = app_private.participant_id())));

DROP POLICY photo_notes_read ON photo_notes;
CREATE POLICY photo_notes_read ON photo_notes FOR SELECT TO app_runtime
  USING (app_private.album_readable(album_id) AND
    (app_private.album_editable(album_id) OR participant_id = app_private.participant_id()));
DROP POLICY photo_notes_write ON photo_notes;
CREATE POLICY photo_notes_studio_write ON photo_notes FOR ALL TO app_runtime
  USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id));
CREATE POLICY photo_notes_participant_insert ON photo_notes FOR INSERT TO app_runtime
  WITH CHECK (app_private.album_participatable(album_id) AND participant_id = app_private.participant_id());
CREATE POLICY photo_notes_participant_update ON photo_notes FOR UPDATE TO app_runtime
  USING (app_private.album_participatable(album_id) AND participant_id = app_private.participant_id())
  WITH CHECK (app_private.album_participatable(album_id) AND participant_id = app_private.participant_id());

DROP POLICY photo_note_revisions_read ON photo_note_revisions;
CREATE POLICY photo_note_revisions_read ON photo_note_revisions FOR SELECT TO app_runtime
  USING (app_private.album_readable(album_id) AND
    (app_private.album_editable(album_id) OR EXISTS (
      SELECT 1 FROM photo_notes n WHERE n.id = note_id AND n.participant_id = app_private.participant_id()
    )));
DROP POLICY photo_note_revisions_write ON photo_note_revisions;
CREATE POLICY photo_note_revisions_studio_write ON photo_note_revisions FOR ALL TO app_runtime
  USING (app_private.album_editable(album_id)) WITH CHECK (app_private.album_editable(album_id));
CREATE POLICY photo_note_revisions_participant_insert ON photo_note_revisions FOR INSERT TO app_runtime
  WITH CHECK (app_private.album_participatable(album_id) AND EXISTS (
    SELECT 1 FROM photo_notes n WHERE n.id = note_id AND n.participant_id = app_private.participant_id()
  ));
