-- ================================================================
-- Invite acceptance: server-side email fallback
--
-- Problem: accept_invite() previously required the token that
-- AcceptInvite.tsx stashes in localStorage right before the OTP round
-- trip. That token only survives if the same browser/tab/app completes
-- the whole flow — it's lost if the invitee switches devices, switches
-- out of an in-app browser (WhatsApp, etc.), or simply signs in via
-- /login or /signup instead of clicking through /accept-invite. When
-- the token is missing, AuthContext had no way to find the pending
-- invite at all and fell straight to "treat as brand-new owner",
-- producing a confusing "account data not found" error for a real
-- invitee.
--
-- Fix: make p_token optional. When omitted, resolve the invite by the
-- authenticated caller's own email address instead — this makes
-- acceptance work regardless of which page/device/browser the invitee
-- ends up authenticating from.
-- ================================================================

CREATE OR REPLACE FUNCTION public.accept_invite(p_token UUID DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id    UUID := auth.uid();
  v_caller_email TEXT;
  v_invite       RECORD;
BEGIN
  IF v_caller_id IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Not authenticated');
  END IF;

  SELECT email INTO v_caller_email FROM auth.users WHERE id = v_caller_id;

  IF p_token IS NOT NULL THEN
    SELECT i.id, i.team_member_id, tm.email AS tm_email
    INTO   v_invite
    FROM   team_member_invites i
    JOIN   team_members         tm ON tm.id = i.team_member_id
    WHERE  i.token       = p_token
      AND  i.accepted_at IS NULL
      AND  i.expires_at  > now();

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'reason', 'Invalid or expired invite token');
    END IF;

    -- Prevent one user from accepting another user's invite
    IF lower(v_caller_email) != lower(v_invite.tm_email) THEN
      RETURN json_build_object('success', false, 'reason', 'Email mismatch');
    END IF;
  ELSE
    -- Fallback: most recent open invite for this email, regardless of token.
    SELECT i.id, i.team_member_id, tm.email AS tm_email
    INTO   v_invite
    FROM   team_member_invites i
    JOIN   team_members         tm ON tm.id = i.team_member_id
    WHERE  lower(i.email)  = lower(v_caller_email)
      AND  i.accepted_at IS NULL
      AND  i.expires_at  > now()
    ORDER BY i.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN json_build_object('success', false, 'reason', 'No pending invite found for this email');
    END IF;
  END IF;

  UPDATE team_members        SET auth_user_id = v_caller_id WHERE id = v_invite.team_member_id;
  UPDATE team_member_invites SET accepted_at  = now()       WHERE id = v_invite.id;

  RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invite(UUID) TO authenticated;
