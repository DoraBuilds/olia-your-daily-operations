// Size bands behind "unlimited users per location". Nothing is enforced:
// the band only decides which flat price a location sits in at renewal.
// Active staff = used Olia in the last 30 days (see get_active_staff_counts()).

export type StaffSizeBand = "standard" | "large" | "custom";

export const STANDARD_BAND_MAX = 50;
export const LARGE_BAND_MAX = 150;

export function staffSizeBand(activeStaff: number): StaffSizeBand {
  if (activeStaff <= STANDARD_BAND_MAX) return "standard";
  if (activeStaff <= LARGE_BAND_MAX) return "large";
  return "custom";
}
