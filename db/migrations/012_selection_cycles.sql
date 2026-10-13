ALTER TABLE albums ADD COLUMN current_cycle integer NOT NULL DEFAULT 1 CHECK (current_cycle > 0);
ALTER TABLE selection_rounds ADD COLUMN cycle integer NOT NULL DEFAULT 1 CHECK (cycle > 0);
ALTER TABLE selection_rounds DROP CONSTRAINT selection_rounds_album_id_round_number_key;
ALTER TABLE selection_rounds ADD CONSTRAINT selection_rounds_album_cycle_round_key UNIQUE (album_id, cycle, round_number);
ALTER TABLE selection_versions ADD COLUMN cycle integer NOT NULL DEFAULT 1 CHECK (cycle > 0);

CREATE UNIQUE INDEX selection_lists_participant_round_idx ON selection_lists (round_id, participant_id, kind)
  WHERE participant_id IS NOT NULL;
CREATE UNIQUE INDEX selection_lists_shared_round_idx ON selection_lists (round_id)
  WHERE kind = 'shared';
