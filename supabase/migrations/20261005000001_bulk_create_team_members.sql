-- Bulk import of kiosk-only team members (#1068).
--
-- SECURITY INVOKER on purpose: every insert goes through the same RLS policy
-- (team_members_insert) and the same BEFORE INSERT triggers (name sync,
-- hash_team_member_pin -> pin_vault, is_owner sync) as the single-add modal.
-- Owner-only is enforced explicitly, matching the Users tab.
--
-- Each row runs in its own subtransaction so one bad row (e.g. a PIN
-- collision) is reported instead of aborting the batch. Capped at 50 rows per
-- call because every PIN is bcrypt-hashed at cost 12 by the trigger; the
-- client sends larger files in chunks.
--
-- Input rows: [{ idx, first_name, last_name, pin|null, department_id|null }]
-- Output:     [{ idx, status: 'created'|'error', id?, error? }]

CREATE OR REPLACE FUNCTION public.bulk_create_team_members(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id   uuid := public.current_org_id();
  v_row      jsonb;
  v_idx      int;
  v_first    text;
  v_last     text;
  v_pin      text;
  v_dep_id   uuid;
  v_dep_ids  uuid[];
  v_new_id   uuid;
  v_tries    int;
  v_results  jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_owner() THEN
    RAISE EXCEPTION 'Only owners can import team members';
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array';
  END IF;
  IF jsonb_array_length(p_rows) > 50 THEN
    RAISE EXCEPTION 'Too many rows (max 50 per call)';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_idx   := COALESCE((v_row->>'idx')::int, 0);
    v_first := btrim(COALESCE(v_row->>'first_name', ''));
    v_last  := nullif(btrim(COALESCE(v_row->>'last_name', '')), '');
    v_pin   := nullif(btrim(COALESCE(v_row->>'pin', '')), '');

    BEGIN
      IF v_first = '' THEN
        RAISE EXCEPTION 'first_name_required' USING ERRCODE = 'P0001';
      END IF;

      -- Optional department: only kept when it exists in the caller's org.
      v_dep_ids := '{}';
      v_dep_id := nullif(v_row->>'department_id', '')::uuid;
      IF v_dep_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.departments d WHERE d.id = v_dep_id) THEN
        v_dep_ids := ARRAY[v_dep_id];
      END IF;

      IF v_pin IS NOT NULL THEN
        IF v_pin !~ '^\d{4}$' THEN
          RAISE EXCEPTION 'pin_invalid' USING ERRCODE = 'P0001';
        END IF;
        IF EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.organization_id = v_org_id
            AND tm.pin_uniqueness_hash = encode(digest(v_org_id::text || v_pin, 'sha256'), 'hex')
        ) THEN
          RAISE EXCEPTION 'pin_taken' USING ERRCODE = 'P0001';
        END IF;
      ELSE
        v_tries := 0;
        LOOP
          v_pin := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
          EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.organization_id = v_org_id
              AND tm.pin_uniqueness_hash = encode(digest(v_org_id::text || v_pin, 'sha256'), 'hex')
          );
          v_tries := v_tries + 1;
          IF v_tries >= 200 THEN
            RAISE EXCEPTION 'no_pin_available' USING ERRCODE = 'P0001';
          END IF;
        END LOOP;
      END IF;

      INSERT INTO public.team_members (
        organization_id, name, first_name, last_name, role,
        is_manager, department_ids, location_ids, pin, pin_reset_required
      ) VALUES (
        v_org_id, btrim(v_first || ' ' || COALESCE(v_last, '')), v_first, v_last, '',
        false, v_dep_ids, '{}', v_pin, false
      )
      RETURNING id INTO v_new_id;

      v_results := v_results || jsonb_build_object('idx', v_idx, 'status', 'created', 'id', v_new_id);
    EXCEPTION
      WHEN unique_violation THEN
        v_results := v_results || jsonb_build_object('idx', v_idx, 'status', 'error', 'error', 'pin_taken');
      WHEN OTHERS THEN
        v_results := v_results || jsonb_build_object('idx', v_idx, 'status', 'error', 'error', SQLERRM);
    END;
  END LOOP;

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_create_team_members(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_create_team_members(jsonb) TO authenticated;
