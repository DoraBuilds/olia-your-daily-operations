export type InfohubSection = "library" | "training";
export type InfohubAccessScope = "org" | "restricted";

export interface InfohubAccessControl {
  accessScope: InfohubAccessScope;
  allowedTeamMemberIds: string[];
  allowedRoles: string[];
  allowedLocationIds: string[];
}

export interface InfohubPrincipal {
  teamMemberId?: string | null;
  role?: string | null;
  locationIds?: string[] | null;
  isOwner?: boolean;
  permissions?: Record<string, boolean> | null;
}

export const DEFAULT_INFOHUB_ACCESS: InfohubAccessControl = {
  accessScope: "org",
  allowedTeamMemberIds: [],
  allowedRoles: [],
  allowedLocationIds: [],
};

export function canManageInfohubAccess(principal: InfohubPrincipal): boolean {
  return Boolean(
    principal.isOwner
    || principal.permissions?.create_edit_checklists
    || principal.permissions?.manage_staff_profiles,
  );
}

export function canAccessInfohubContent(
  access: InfohubAccessControl,
  principal: InfohubPrincipal,
): boolean {
  if (principal.isOwner) return true;
  if (access.accessScope === "org") return true;

  const locationIds = principal.locationIds ?? [];

  return Boolean(
    (principal.teamMemberId && access.allowedTeamMemberIds.includes(principal.teamMemberId))
    || (principal.role && access.allowedRoles.includes(principal.role))
    || locationIds.some(locationId => access.allowedLocationIds.includes(locationId)),
  );
}

