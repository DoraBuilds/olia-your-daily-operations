// Training completion report (#915): for each training doc, who it applies
// to (everyone it's shared with, per the Info Hub sharing rules) and who has
// completed it. Owners are left out — they can see every training.

import { canAccessInfohubContent, type InfohubAccessControl, type InfohubPrincipal } from "@/lib/infohub-access";
import type { TeamMember } from "@/lib/admin-repository";
import type { TrainingProgressRow } from "@/hooks/useTrainingProgress";
import { reachableFolderIds } from "@/pages/infohub/infohub-filters";

export interface ReportFolder { id: string; name: string; parentId: string | null; access: InfohubAccessControl }
export interface ReportDoc { id: string; title: string; folderId: string; access: InfohubAccessControl }

export interface TrainingReportRow {
  doc: ReportDoc;
  folderName: string;
  completed: { member: TeamMember; completedAt: string | null }[];
  notCompleted: TeamMember[];
  total: number;
  /** 0–100, or null when the training applies to nobody in scope. */
  pct: number | null;
}

export interface TrainingReportScope {
  /** null = every location. */
  locationIds: string[] | null;
  /** null = every department. */
  departmentIds: string[] | null;
  search: string;
}

function memberInScope(m: TeamMember, scope: TrainingReportScope) {
  if (m.is_owner) return false;
  // Empty location_ids = every location, so they're in scope for any location.
  if (scope.locationIds && m.location_ids.length > 0 && !m.location_ids.some(id => scope.locationIds!.includes(id))) return false;
  if (scope.departmentIds && !m.department_ids.some(id => scope.departmentIds!.includes(id))) return false;
  return true;
}

export function buildTrainingReport(
  docs: ReportDoc[],
  folders: ReportFolder[],
  members: TeamMember[],
  progress: TrainingProgressRow[],
  scope: TrainingReportScope,
): TrainingReportRow[] {
  const folderName = new Map(folders.map(f => [f.id, f.name]));
  const done = new Map(
    progress.filter(p => p.is_completed).map(p => [`${p.team_member_id}:${p.module_id}`, p.completed_at]),
  );
  const people = members.filter(m => memberInScope(m, scope)).map(m => {
    const principal: InfohubPrincipal = { teamMemberId: m.id, role: m.role, locationIds: m.location_ids, isOwner: false };
    return {
      member: m,
      principal,
      folders: reachableFolderIds(folders, access => canAccessInfohubContent(access, principal)),
    };
  });
  const query = scope.search.trim().toLowerCase();

  return docs
    .filter(doc => !query || doc.title.toLowerCase().includes(query))
    .map(doc => {
      const assigned = people
        .filter(p => p.folders.has(doc.folderId) && canAccessInfohubContent(doc.access, p.principal))
        .map(p => p.member)
        .sort((a, b) => a.name.localeCompare(b.name));
      const completed: TrainingReportRow["completed"] = [];
      const notCompleted: TeamMember[] = [];
      for (const m of assigned) {
        const key = `${m.id}:${doc.id}`;
        if (done.has(key)) completed.push({ member: m, completedAt: done.get(key) ?? null });
        else notCompleted.push(m);
      }
      const total = assigned.length;
      return {
        doc,
        folderName: folderName.get(doc.folderId) ?? "",
        completed,
        notCompleted,
        total,
        pct: total === 0 ? null : Math.round((completed.length / total) * 100),
      };
    })
    // Biggest gaps first; trainings that apply to nobody go last.
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101) || a.doc.title.localeCompare(b.doc.title));
}
