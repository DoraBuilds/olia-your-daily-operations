-- Fix hash_team_member_pin trigger: add 'extensions' to search_path so
-- pgcrypto functions (crypt, gen_salt) resolve correctly.
-- Migration 20260519000004 set search_path = public only, which caused:
--   "function gen_salt(unknown, integer) does not exist"

CREATE OR REPLACE FUNCTION public.hash_team_member_pin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.pin IS NOT NULL AND (
    NEW.pin NOT LIKE '$2a$%' AND
    NEW.pin NOT LIKE '$2b$%' AND
    NEW.pin NOT LIKE '$2x$%' AND
    NEW.pin NOT LIKE '$2y$%'
  ) THEN
    NEW.pin_plaintext := NEW.pin;
    NEW.pin := crypt(NEW.pin, gen_salt('bf', 12));
  END IF;
  RETURN NEW;
END;
$$;
