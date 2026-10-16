-- Existing albums were numbered in the order Drive returned files; renumber by filename.
UPDATE photos p
SET sort_order = ordered.position
FROM (
  SELECT id, (row_number() OVER (PARTITION BY album_id ORDER BY filename COLLATE "C", id) - 1)::integer AS position
  FROM photos
) ordered
WHERE p.id = ordered.id AND p.sort_order <> ordered.position;
