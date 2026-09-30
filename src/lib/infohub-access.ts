export type InfohubSection = "library" | "training";
export type InfohubAccessScope = "org" | "restricted";

/**
 * Who a folder or document is shared with. Restricted content follows the
 * company taxonomy: a place (whole concepts and/or specific locations —
 * nothing picked = every location) AND departments (nothing picked = every
 * department), plus any team members named directly.
 */
export interface InfohubAccessControl {
  accessScope: InfohubAccessScope;
  allowedTeamMemberIds: string[];
  allowedConceptIds: string[];
  allowedLocationIds: string[];
  allowedDepartmentIds: string[];
}

export interface InfohubPrincipal {
  teamMemberId?: string | null;
  /** Empty = every location. */
  locationIds?: string[] | null;
  /** Concepts of `locationIds` — see conceptIdsForLocations. */
  conceptIds?: string[] | null;
  departmentIds?: string[] | null;
  isOwner?: boolean;
  permissions?: Record<string, boolean> | null;
}

export const DEFAULT_INFOHUB_ACCESS: InfohubAccessControl = {
  accessScope: "org",
  allowedTeamMemberIds: [],
  allowedConceptIds: [],
  allowedLocationIds: [],
  allowedDepartmentIds: [],
};

export function conceptIdsForLocations(
  locationIds: string[],
  locations: { id: string; concept_id?: string | null }[],
): string[] {
  return Array.from(new Set(
    locations.filter(l => l.concept_id && locationIds.includes(l.id)).map(l => l.concept_id as string),
  ));
}

export function infohubPrincipalForMember(
  member: { id: string; location_ids?: string[] | null; department_ids?: string[] | null; is_owner?: boolean },
  locations: { id: string; concept_id?: string | null }[],
): InfohubPrincipal {
  const locationIds = member.location_ids ?? [];
  return {
    teamMemberId: member.id,
    locationIds,
    conceptIds: conceptIdsForLocations(locationIds, locations),
    departmentIds: member.department_ids ?? [],
    isOwner: member.is_owner ?? false,
  };
}

export function canManageInfohubAccess(principal: InfohubPrincipal): boolean {
  return Boolean(
    principal.isOwner
    || principal.permissions?.create_edit_checklists
    || principal.permissions?.manage_staff_profiles,
  );
}

/** Mirrors the SQL rule in infohub_member_matches. */
export function canAccessInfohubContent(
  access: InfohubAccessControl,
  principal: InfohubPrincipal,
): boolean {
  if (principal.isOwner) return true;
  if (access.accessScope === "org") return true;
  if (principal.teamMemberId && access.allowedTeamMemberIds.includes(principal.teamMemberId)) return true;

  const hasPlace = access.allowedConceptIds.length > 0 || access.allowedLocationIds.length > 0;
  const hasDepartments = access.allowedDepartmentIds.length > 0;
  // Restricted with nothing picked = owners (and named people) only.
  if (!hasPlace && !hasDepartments) return false;

  const locationIds = principal.locationIds ?? [];
  const placeMatch = !hasPlace
    // No specific locations = every location, so any place applies.
    || locationIds.length === 0
    || locationIds.some(id => access.allowedLocationIds.includes(id))
    || (principal.conceptIds ?? []).some(id => access.allowedConceptIds.includes(id));
  const departmentMatch = !hasDepartments
    || (principal.departmentIds ?? []).some(id => access.allowedDepartmentIds.includes(id));

  return placeMatch && departmentMatch;
}
