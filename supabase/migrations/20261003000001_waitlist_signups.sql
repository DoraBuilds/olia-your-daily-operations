-- Landing-page waitlist. Visitors submit an email; nobody but the service
-- role / dashboard can read it back.
--
-- Duplicates are blocked by a case-insensitive unique index. The client treats
-- a unique violation (23505) the same as success so the form can't be used to
-- discover whether an address is already on the list.

CREATE TABLE IF NOT EXISTS public.waitlist_signups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        NOT NULL,
  source     text        NOT NULL DEFAULT 'landing',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT waitlist_signups_email_format
    CHECK (char_length(email) <= 254 AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT waitlist_signups_source_len CHECK (char_length(source) <= 40)
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_signups_email_lower_key
  ON public.waitlist_signups (lower(email));

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

-- INSERT only: no SELECT / UPDATE / DELETE policies exist for anon or authenticated.
CREATE POLICY "anyone can join the waitlist"
  ON public.waitlist_signups
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(email) <= 254
    AND email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  );

REVOKE ALL ON public.waitlist_signups FROM anon, authenticated;
GRANT INSERT ON public.waitlist_signups TO anon, authenticated;
