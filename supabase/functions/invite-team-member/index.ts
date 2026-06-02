/**
 * invite-team-member
 *
 * Creates (or replaces) a pending invite for an existing team_members row
 * and sends an invitation email via Resend.
 *
 * Called by Admin.tsx after saving a new team member:
 *   supabase.functions.invoke("invite-team-member", { body: { team_member_id } })
 *
 * Required secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
 *   RESEND_API_KEY   → your Resend API key (starts with "re_")
 *
 * Optional:
 *   INVITE_FROM_EMAIL → verified sender address in Resend
 *                       Default: onboarding@resend.dev (dev fallback only)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=denonext";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY            = Deno.env.get("RESEND_API_KEY");
const INVITE_FROM_EMAIL         = Deno.env.get("INVITE_FROM_EMAIL") ?? "onboarding@resend.dev";
const RESEND_ENDPOINT           = "https://api.resend.com/emails";

Deno.serve(async (req: Request): Promise<Response> => {
  const CORS = corsHeaders(req.headers.get("origin"));

  const ok  = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  const err = (message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST")    return err("Method not allowed");

  // ── Authenticate caller ─────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("Not authenticated");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const jwt = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
  if (authError || !user) return err("Invalid session");

  // Caller must be a team member (owner or manager)
  const { data: caller, error: callerError } = await supabase
    .from("team_members")
    .select("organization_id, role")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .single();

  if (callerError || !caller) return err("Caller is not a team member");

  // ── Parse request body ──────────────────────────────────────────────
  let body: { team_member_id?: string };
  try {
    body = await req.json();
  } catch {
    return err("Invalid JSON body");
  }

  const { team_member_id } = body;
  if (!team_member_id) return err("Missing team_member_id");

  // ── Look up team member and org ─────────────────────────────────────
  const { data: member, error: memberError } = await supabase
    .from("team_members")
    .select("id, name, email, organization_id")
    .eq("id", team_member_id)
    .single();

  if (memberError || !member) return err("Team member not found");

  // Caller must belong to the same org as the invitee
  if (member.organization_id !== caller.organization_id) {
    return err("Not authorised to invite members of this organisation");
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", member.organization_id)
    .single();

  if (orgError || !org) return err("Organisation not found");

  // ── Create or replace invite row ────────────────────────────────────
  // Delete any previous un-accepted invite for this team member so the
  // admin can re-send if the original email was missed.
  await supabase
    .from("team_member_invites")
    .delete()
    .eq("team_member_id", team_member_id)
    .is("accepted_at", null);

  const { data: invite, error: inviteError } = await supabase
    .from("team_member_invites")
    .insert({
      organization_id: member.organization_id,
      team_member_id:  team_member_id,
      email:           member.email,
    })
    .select("token")
    .single();

  if (inviteError || !invite) {
    console.error("invite-team-member: insert failed", inviteError);
    return err("Failed to create invite");
  }

  // ── Validate Resend configuration ───────────────────────────────────
  if (!RESEND_API_KEY) {
    console.error("invite-team-member: RESEND_API_KEY is not configured");
    return err("Email service not configured");
  }

  const siteUrl = Deno.env.get("PUBLIC_SITE_URL") ?? "https://dorabuilds.github.io/olia-your-daily-operations";
  const acceptUrl = `${siteUrl}/accept-invite?token=${invite.token}`;

  // ── Build email ─────────────────────────────────────────────────────
  const subject = `You've been invited to join ${org.name} on Olia`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#FDFAF7;font-family:'DM Sans',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FDFAF7;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:40px;border:1px solid #E5E7EB;">
          <tr>
            <td>
              <h1 style="font-size:24px;color:#1A2A47;margin:0 0 8px;">You're invited!</h1>
              <p style="font-size:15px;color:#6B7280;margin:0 0 24px;">
                You've been added to <strong style="color:#1A2A47;">${org.name}</strong> as a team member on Olia.
              </p>
              <p style="font-size:15px;color:#4B5563;margin:0 0 32px;">
                Click the button below to accept your invitation and set up your account.
                This link expires in 7 days.
              </p>
              <a href="${acceptUrl}"
                 style="display:inline-block;background:#1A2A47;color:#ffffff;padding:14px 28px;
                        border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;">
                Accept invitation
              </a>
              <p style="font-size:12px;color:#9CA3AF;margin:32px 0 0;">
                Or copy this link: ${acceptUrl}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const textBody = `You've been invited to join ${org.name} on Olia.\n\nAccept your invitation here: ${acceptUrl}\n\nThis link expires in 7 days.`;

  // ── Send via Resend ─────────────────────────────────────────────────
  const resendRes = await fetch(RESEND_ENDPOINT, {
    method:  "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    INVITE_FROM_EMAIL,
      to:      [member.email],
      subject,
      text:    textBody,
      html:    htmlBody,
    }),
  });

  const resendBody = await resendRes.json().catch(() => ({}));

  if (!resendRes.ok) {
    console.error(`invite-team-member: Resend error ${resendRes.status}`, JSON.stringify(resendBody));
    return err("Failed to send invitation email");
  }

  console.log(`invite-team-member: sent invite for team_member ${team_member_id} → ${member.email}, resend_id=${resendBody?.id}`);

  return ok({ sent: true, resend_id: resendBody?.id });
});
