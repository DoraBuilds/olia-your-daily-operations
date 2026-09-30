import { canAccessInfohubContent, type InfohubAccessControl, type InfohubPrincipal } from "@/lib/infohub-access";

export type DocKind = "all" | "written" | "file";
export type Progress = "all" | "completed" | "incomplete";

/** Everything an Info Hub Filters popover edits. Library ignores `progress`; Training ignores `tags`/`kind`. */
export interface InfohubFilters {
  conceptIds: string[];
  locationIds: string[];
  departmentIds: string[];
  memberIds: string[];
  tags: string[];
  kind: DocKind;
  progress: Progress;
}

export const DEFAULT_INFOHUB_FILTERS: InfohubFilters = {
  conceptIds: [], locationIds: [], departmentIds: [], memberIds: [], tags: [], kind: "all", progress: "all",
};

export function activeInfohubFilterCount(f: InfohubFilters): number {
  return [f.conceptIds.length > 0, f.locationIds.length > 0, f.departmentIds.length > 0, f.memberIds.length > 0,
    f.tags.length > 0, f.kind !== "all", f.progress !== "all"].filter(Boolean).length;
}

export interface AccessFilterContext {
  /** Locations picked directly, or every location of the picked concept(s); null = no location/concept filter. */
  locationIds: string[] | null;
  /** The concepts those locations belong to. */
  conceptIds: string[];
  departmentIds: string[];
  members: InfohubPrincipal[];
}

/**
 * Whether content with this access could be seen by the people the filters
 * describe. Content visible to everyone always matches. Restricted content
 * (shared with a place + departments, or with named people) matches when
 * someone at the filtered location(s) in the filtered department(s) could
 * see it; a Team member filter additionally requires one of those members
 * to see it.
 */
export function accessMatchesFilters(access: InfohubAccessControl, ctx: AccessFilterContext): boolean {
  if (access.accessScope === "org") return true;

  if (ctx.members.length > 0 && !ctx.members.some(m => canAccessInfohubContent(access, m))) return false;

  if (ctx.locationIds === null && ctx.departmentIds.length === 0) return true;
  const hasPlace = access.allowedConceptIds.length > 0 || access.allowedLocationIds.length > 0;
  const hasDepartments = access.allowedDepartmentIds.length > 0;
  const viaTaxonomy = (hasPlace || hasDepartments)
    && (!hasPlace || ctx.locationIds === null
      || ctx.locationIds.some(id => access.allowedLocationIds.includes(id))
      || ctx.conceptIds.some(id => access.allowedConceptIds.includes(id)))
    && (!hasDepartments || ctx.departmentIds.length === 0
      || ctx.departmentIds.some(id => access.allowedDepartmentIds.includes(id)));
  // Named people count only if one of them fits the location/department filters.
  const viaMember = ctx.members.length > 0
    ? ctx.members.some(m => !!m.teamMemberId && access.allowedTeamMemberIds.includes(m.teamMemberId) && memberFits(m, ctx))
    : access.allowedTeamMemberIds.length > 0;
  return viaTaxonomy || viaMember;
}

function memberFits(m: InfohubPrincipal, ctx: AccessFilterContext): boolean {
  if (ctx.departmentIds.length > 0 && !(m.departmentIds ?? []).some(id => ctx.departmentIds.includes(id))) return false;
  const locationIds = m.locationIds ?? [];
  // No specific locations = every location.
  if (ctx.locationIds !== null && locationIds.length > 0 && !locationIds.some(id => ctx.locationIds!.includes(id))) return false;
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
