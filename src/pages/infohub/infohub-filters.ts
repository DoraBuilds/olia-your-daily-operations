import { canAccessInfohubContent, type InfohubAccessControl } from "@/lib/infohub-access";

export type DocKind = "all" | "written" | "file";
export type Progress = "all" | "completed" | "incomplete";

/** Everything an Info Hub Filters popover edits. Library ignores `progress`; Training ignores `tags`/`kind`. */
export interface InfohubFilters {
  conceptIds: string[];
  locationIds: string[];
  roles: string[];
  memberIds: string[];
  tags: string[];
  kind: DocKind;
  progress: Progress;
}

export const DEFAULT_INFOHUB_FILTERS: InfohubFilters = {
  conceptIds: [], locationIds: [], roles: [], memberIds: [], tags: [], kind: "all", progress: "all",
};

export function activeInfohubFilterCount(f: InfohubFilters): number {
  return [f.conceptIds.length > 0, f.locationIds.length > 0, f.roles.length > 0, f.memberIds.length > 0,
    f.tags.length > 0, f.kind !== "all", f.progress !== "all"].filter(Boolean).length;
}

export interface FilterMember {
  id: string;
  role: string | null;
  location_ids: string[] | null;
  is_owner?: boolean;
}

export interface AccessFilterContext {
  /** Locations picked directly, or every location of the picked concept(s); null = no location/concept filter. */
  locationIds: string[] | null;
  roles: string[];
  members: FilterMember[];
}

/**
 * Whether content with this access could be seen by the people the filters
 * describe. Content visible to everyone always matches. Restricted content
 * (visible via a listed person OR role OR location) matches when someone at
 * the filtered location(s) with the filtered role(s) could see it; a Team
 * member filter additionally requires one of those members to see it.
 */
export function accessMatchesFilters(access: InfohubAccessControl, ctx: AccessFilterContext): boolean {
  if (access.accessScope === "org") return true;

  if (ctx.members.length > 0 && !ctx.members.some(m => canAccessInfohubContent(access, {
    teamMemberId: m.id, role: m.role, locationIds: m.location_ids ?? [], isOwner: m.is_owner,
  }))) return false;

  if (ctx.locationIds === null && ctx.roles.length === 0) return true;
  const viaLocation = ctx.locationIds === null
    ? access.allowedLocationIds.length > 0
    : access.allowedLocationIds.some(id => ctx.locationIds.includes(id));
  const viaRole = ctx.roles.length === 0
    ? access.allowedRoles.length > 0
    : access.allowedRoles.some(r => ctx.roles.includes(r));
  // Named people count only if one of them fits the location/role filters.
  const viaMember = ctx.members.length > 0
    ? ctx.members.some(m => access.allowedTeamMemberIds.includes(m.id) && memberFits(m, ctx))
    : access.allowedTeamMemberIds.length > 0;
  return viaLocation || viaRole || viaMember;
}

function memberFits(m: FilterMember, ctx: AccessFilterContext): boolean {
  if (ctx.roles.length > 0 && !(m.role && ctx.roles.includes(m.role))) return false;
  if (ctx.locationIds !== null && !(m.location_ids ?? []).some(id => ctx.locationIds.includes(id))) return false;
  return true;
}

/**
 * Folder ids whose own access, and every ancestor's, passes `matches` — so a
 * doc only counts when the folders leading to it would be reachable too.
 */
export function reachableFolderIds<F extends { id: string; parentId: string | null; access: InfohubAccessControl }>(
  folders: F[],
  matches: (access: InfohubAccessControl) => boolean,
): Set<string> {
  const byId = new Map(folders.map(f => [f.id, f]));
  const memo = new Map<string, boolean>();
  const ok = (id: string, depth = 0): boolean => {
    if (memo.has(id)) return memo.get(id);
    const folder = byId.get(id);
    // Missing folder or a cycle: don't block the doc on bad data.
    const result = !folder || depth > 50 ? true : matches(folder.access) && (folder.parentId === null || ok(folder.parentId, depth + 1));
    memo.set(id, result);
    return result;
  };
  return new Set(folders.filter(f => ok(f.id)).map(f => f.id));
}
