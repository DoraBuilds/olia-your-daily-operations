-- Allow 'member' as a valid pin_type in pin_attempts.
-- validate_kiosk_member_pin (added in 20260708000001) records attempts
-- with pin_type = 'member', which the original CHECK only allowed
-- 'admin' and 'staff', causing a 400 Bad Request at the kiosk.

ALTER TABLE public.pin_attempts
  DROP CONSTRAINT IF EXISTS pin_attempts_pin_type_check;

ALTER TABLE public.pin_attempts
  ADD CONSTRAINT pin_attempts_pin_type_check
  CHECK (pin_type IN ('admin', 'staff', 'member'));
