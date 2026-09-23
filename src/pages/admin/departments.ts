// Pure helpers for company-wide departments (#838). They mirror the SQL in
// 20260923000001_company_wide_departments.sql (location_departments view +
// prune_department_links) so the Departments tab can warn how many staff and
// checklists an assignment change will unassign before it's saved.

import type { DepartmentAssignment, Location, TeamMember } from "@/lib/admin-repository";
import type { ChecklistItem } from "@/hooks/useChecklists";

/** Every location an assignment list covers. Company-wide and whole-concept entries are live: they cover the current locations. */
export function resolveDepartmentLocationIds(
  assignments: DepartmentAssignment[],
  locations: Pick<Location, "id" | "concept_id">[],
): Set<string> {
  const ids = new Set<string>();
  for (const a of assignments) {
    if (a.location_id) {
      ids.add(a.location_id);
    } else {
      for (const l of locations) if (a.concept_id === null || l.concept_id === a.concept_id) ids.add(l.id);
    }
  }
  return ids;
}

/** A team member with no locations covers every location. */
function memberCovered(member: Pick<TeamMember, "location_ids">, covered: Set<string>): boolean {
  return member.location_ids.length === 0 ? covered.size > 0 : member.location_ids.some(id => covered.has(id));
}

/** Checklist targets: explicit locations, else its concept's locations, else every location. */
function checklistCovered(
  checklist: Pick<ChecklistItem, "location_id" | "location_ids" | "concept_id">,
  covered: Set<string>,
  locations: Pick<Location, "id" | "concept_id">[],
): boolean {
  const explicit = checklist.location_ids?.length
    ? checklist.location_ids
    : checklist.location_id ? [checklist.location_id] : null;
  if (explicit) return explicit.some(id => covered.has(id));
  const targets = checklist.concept_id ? locations.filter(l => l.concept_id === checklist.concept_id) : locations;
  return targets.some(l => covered.has(l.id));
}

/**
 * Staff and checklists that currently carry this department but would lose
 * it with the new assignments (pass [] for a delete).
 */
export function departmentUnassignImpact(
  departmentId: string,
  nextAssignments: DepartmentAssignment[],
  locations: Pick<Location, "id" | "concept_id">[],
  teamMembers: Pick<TeamMember, "location_ids" | "department_ids">[],
  checklists: Pick<ChecklistItem, "location_id" | "location_ids" | "concept_id" | "department_ids">[],
): { staff: number; checklists: number } {
  const covered = resolveDepartmentLocationIds(nextAssignments, locations);
  return {
    staff: teamMembers.filter(m => m.department_ids.includes(departmentId) && !memberCovered(m, covered)).length,
    checklists: checklists.filter(c =>
      (c.department_ids ?? []).includes(departmentId) && !checklistCovered(c, covered, locations),
    ).length,
  };
}

/**
 * The Departments editor uses Reporting-style Concept + Location dropdowns,
 * where an empty selection means "All". Mapping to assignments:
 *   locations picked                → exactly those locations
 *   concepts picked, all locations  → every location in each concept (live)
 *   all concepts, all locations     → the whole company (live)
 */
export function selectionToAssignments(
  conceptIds: string[],
  locationIds: string[],
  locations: Pick<Location, "id" | "concept_id">[],
): DepartmentAssignment[] {
  if (locationIds.length > 0) {
    return locations
      .filter(l => l.concept_id && locationIds.includes(l.id))
      .map(l => ({ concept_id: l.concept_id!, location_id: l.id }));
  }
  if (conceptIds.length > 0) return conceptIds.map(id => ({ concept_id: id, location_id: null }));
  return [{ concept_id: null, location_id: null }];
}

/** Inverse of selectionToAssignments, for opening the editor on an existing department. */
export function assignmentsToSelection(
  assignments: DepartmentAssignment[],
  locations: Pick<Location, "id" | "concept_id">[],
): { conceptIds: string[]; locationIds: string[] } {
  if (assignments.length === 0 || assignments.some(a => a.concept_id === null)) {
    return { conceptIds: [], locationIds: [] };
  }
  if (assignments.every(a => a.location_id === null)) {
    return { conceptIds: [...new Set(assignments.map(a => a.concept_id!))], locationIds: [] };
  }
  const locationIds = [...resolveDepartmentLocationIds(assignments, locations)];
  const conceptIds = [...new Set(
    locations.filter(l => locationIds.includes(l.id) && l.concept_id).map(l => l.concept_id!),
  )];
  return { conceptIds, locationIds };
}

/** Adds one location to a department's assignments (no-op if it's already covered). */
export function addLocationToAssignments(
  assignments: DepartmentAssignment[],
  location: Pick<Location, "id" | "concept_id">,
  locations: Pick<Location, "id" | "concept_id">[],
): DepartmentAssignment[] {
  if (!location.concept_id || resolveDepartmentLocationIds(assignments, locations).has(location.id)) return assignments;
  return [...assignments, { concept_id: location.concept_id, location_id: location.id }];
}

/**
 * Takes one location out of a department's assignments. A company-wide or
 * whole-concept assignment covering it is split so everything else it covered
 * stays covered, keeping as much of it live as possible: company-wide becomes
 * every other concept (still live) plus the other locations in this one.
 */
export function removeLocationFromAssignments(
  assignments: DepartmentAssignment[],
  location: Pick<Location, "id" | "concept_id">,
  locations: Pick<Location, "id" | "concept_id">[],
  conceptIds: string[],
): DepartmentAssignment[] {
  const siblings = (): DepartmentAssignment[] => locations
    .filter(l => l.concept_id === location.concept_id && l.id !== location.id)
    .map(l => ({ concept_id: l.concept_id!, location_id: l.id }));

  if (assignments.some(a => a.concept_id === null)) {
    return [
      ...conceptIds.filter(id => id !== location.concept_id).map(id => ({ concept_id: id, location_id: null })),
      ...siblings(),
    ];
  }
  const next = assignments.filter(a => a.location_id !== location.id);
  if (!next.some(a => a.concept_id === location.concept_id && a.location_id === null)) return next;
  // The whole-concept entry already covered any specific picks in this concept.
  return [...next.filter(a => a.concept_id !== location.concept_id), ...siblings()];
}
