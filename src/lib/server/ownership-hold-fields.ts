// Small list metadata; never copy the lifecycle audit/financial snapshots to every table row.
export const OWNERSHIP_HOLD_FIELDS_SQL=`o.draft_payload #>> '{management_composer,lifecycle,active_hold,until}' AS hold_until,
  o.draft_payload #>> '{management_composer,lifecycle,active_hold,at}' AS held_at,
  (o.draft_payload #> '{management_composer,lifecycle,hold_completion}' IS NOT NULL) AS completed_from_hold`;
