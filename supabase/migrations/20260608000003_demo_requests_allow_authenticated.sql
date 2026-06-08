-- The original policy only covered the anon role.
-- Authenticated users (e.g. logged-in app users visiting the landing page)
-- were blocked. Allow both roles to insert demo requests.
DROP POLICY IF EXISTS "anon can insert demo requests" ON public.demo_requests;

CREATE POLICY "anyone can insert demo requests"
  ON public.demo_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
