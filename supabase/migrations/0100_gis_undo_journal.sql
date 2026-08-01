/* Undo / redo journal for the GIS canvas.

   One row per action, holding what that action did to the feature rows —
   as they were, and as they became. Undo writes the "before" side back;
   redo writes the "after" side. Recording both is what lets a new
   drawing tool get undo without anyone working out how to reverse it.

   Kept in the database rather than the browser so the history survives a
   reload, which is when it is most wanted: the drawing that needs
   undoing is often the one that made you reload.

   Per project and per user. Two designers on one site each undo their
   own work; undoing someone else's is not undo, it is a fight. */

CREATE TABLE IF NOT EXISTS "GIS_Undo" (
  "Undo_ID"    bigserial PRIMARY KEY,
  "Project_ID" bigint      NOT NULL REFERENCES "Project" ON DELETE CASCADE,
  /* Nullable because currentUser() is verified but not yet enforced —
     every endpoint still works without a token. An unauthenticated
     session gets its own history under the nil uuid rather than none. */
  "User_ID"    uuid,
  "Seq"        bigint      NOT NULL,
  "Label"      text        NOT NULL,
  "Delta"      jsonb       NOT NULL,
  /* The pointer, held per row rather than as a single index. Undone
     entries are the redo future, in Seq order; the rest are the past. */
  "Undone"     boolean     NOT NULL DEFAULT false,
  "Created_At" timestamptz NOT NULL DEFAULT now()
);

/* NULL never equals NULL, so a unique index straight over "User_ID"
   would let the same Seq be inserted repeatedly for signed-out sessions
   and put the history out of order. Folding null to the nil uuid is what
   makes the constraint mean what it says. */
CREATE UNIQUE INDEX IF NOT EXISTS gis_undo_seq_idx
  ON "GIS_Undo" ("Project_ID",
                 COALESCE("User_ID", '00000000-0000-0000-0000-000000000000'::uuid),
                 "Seq");

CREATE INDEX IF NOT EXISTS gis_undo_lookup_idx
  ON "GIS_Undo" ("Project_ID",
                 COALESCE("User_ID", '00000000-0000-0000-0000-000000000000'::uuid),
                 "Seq" DESC);

/* Same posture as every other table here: on, with no policies, so the
   anon key reads nothing and all access goes through the functions. */
ALTER TABLE "GIS_Undo" ENABLE ROW LEVEL SECURITY;


/* Trim the history to the newest few.

   Dropped and recreated rather than replaced, because CREATE OR REPLACE
   cannot change a return type and this one has been edited before.

   p_keep rather than "keep": a bare "limit" or "by" fails to parse as a
   plpgsql variable, and staying away from anything word-like is cheaper
   than finding out which ones are reserved. */
DROP FUNCTION IF EXISTS prune_gis_undo(bigint, uuid, integer);

CREATE FUNCTION prune_gis_undo(p_project bigint, p_user uuid, p_keep integer DEFAULT 25)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_nil uuid := '00000000-0000-0000-0000-000000000000'::uuid;
  v_gone integer;
BEGIN
  WITH keepers AS (
    SELECT "Undo_ID"
    FROM "GIS_Undo"
    WHERE "Project_ID" = p_project
      AND COALESCE("User_ID", v_nil) = COALESCE(p_user, v_nil)
    ORDER BY "Seq" DESC
    LIMIT p_keep
  ), removed AS (
    DELETE FROM "GIS_Undo"
    WHERE "Project_ID" = p_project
      AND COALESCE("User_ID", v_nil) = COALESCE(p_user, v_nil)
      AND "Undo_ID" NOT IN (SELECT "Undo_ID" FROM keepers)
    RETURNING 1
  )
  SELECT count(*) INTO v_gone FROM removed;

  RETURN v_gone;
END;
$$;


/* The next sequence number for a project and user. One place rather than
   a read-then-insert in the endpoint, which two quick actions can
   interleave and land on the same number. */
DROP FUNCTION IF EXISTS next_gis_undo_seq(bigint, uuid);

CREATE FUNCTION next_gis_undo_seq(p_project bigint, p_user uuid)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COALESCE(MAX("Seq"), 0) + 1
  FROM "GIS_Undo"
  WHERE "Project_ID" = p_project
    AND COALESCE("User_ID", '00000000-0000-0000-0000-000000000000'::uuid)
      = COALESCE(p_user, '00000000-0000-0000-0000-000000000000'::uuid);
$$;
