import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_INFOHUB_ACCESS,
  canManageInfohubAccess,
  type InfohubAccessControl,
  type InfohubSection,
} from "@/lib/infohub-access";
import {
  initialLibraryDocs,
  initialLibraryFolders,
  initialTrainingDocs,
  initialTrainingFolders,
  type InfohubLibraryDoc,
  type InfohubLibraryFolder,
  type InfohubTrainingDoc,
  type InfohubTrainingFolder,
} from "@/lib/infohub-catalog";

interface InfohubFolderRow {
  id: string;
  organization_id: string;
  section: InfohubSection;
  parent_id: string | null;
  name: string;
  sort_order: number | null;
  access_scope: InfohubAccessControl["accessScope"];
  allowed_team_member_ids: string[] | null;
  allowed_roles: string[] | null;
  allowed_location_ids: string[] | null;
  created_by?: string | null;
}

interface InfohubDocumentRow {
  id: string;
  organization_id: string;
  section: InfohubSection;
  folder_id: string;
  title: string;
  summary: string;
  body: string;
  metadata: {
    tags?: string[];
    duration?: string;
    steps?: string[];
  } | null;
  archived_at: string | null;
  access_scope: InfohubAccessControl["accessScope"];
  allowed_team_member_ids: string[] | null;
  allowed_roles: string[] | null;
  allowed_location_ids: string[] | null;
  created_by?: string | null;
  updated_at: string;
}

interface InfohubSeedPayload {
  folders: InfohubFolderRow[];
  documents: Omit<InfohubDocumentRow, "archived_at" | "updated_at">[];
}

export interface InfohubContentData {
  libraryFolders: InfohubLibraryFolder[];
  libraryDocs: InfohubLibraryDoc[];
  archivedLibraryDocs: InfohubLibraryDoc[];
  trainingFolders: InfohubTrainingFolder[];
  trainingDocs: InfohubTrainingDoc[];
}

interface CreateFolderInput {
  section: InfohubSection;
  name: string;
  parentId: string | null;
}

interface CreateDocumentInput {
  section: InfohubSection;
  title: string;
  folderId: string;
  tags?: string[];
}

interface UpdateFolderInput {
  id: string;
  name?: string;
  parentId?: string | null;
  sortOrder?: number | null;
  access?: InfohubAccessControl;
}

interface UpdateDocumentInput {
  id: string;
  section: InfohubSection;
  folderId?: string;
  title?: string;
  summary?: string;
  body?: string;
  tags?: string[];
  duration?: string;
  steps?: string[];
  access?: InfohubAccessControl;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function mapAccess(row: Pick<InfohubFolderRow, "access_scope" | "allowed_team_member_ids" | "allowed_roles" | "allowed_location_ids">): InfohubAccessControl {
  return {
    accessScope: row.access_scope ?? "org",
    allowedTeamMemberIds: row.allowed_team_member_ids ?? [],
    allowedRoles: row.allowed_roles ?? [],
    allowedLocationIds: row.allowed_location_ids ?? [],
  };
}

function mapFolderRow(row: InfohubFolderRow): InfohubLibraryFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    access: mapAccess(row),
  };
}

function mapLibraryDocRow(row: InfohubDocumentRow): InfohubLibraryDoc {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.body,
    tags: row.metadata?.tags ?? [],
    lastUpdated: formatDate(row.updated_at),
    folderId: row.folder_id,
    access: mapAccess(row),
  };
}

function mapTrainingDocRow(row: InfohubDocumentRow): InfohubTrainingDoc {
  return {
    id: row.id,
    title: row.title,
    duration: row.metadata?.duration ?? "5 min",
    completed: false,
    folderId: row.folder_id,
    steps: row.metadata?.steps ?? [],
    access: mapAccess(row),
  };
}

function buildSeedPayload(organizationId: string, teamMemberId?: string | null): InfohubSeedPayload {
  const folderIdMap = new Map<string, string>();
  const createFolderId = (seedId: string) => {
    const nextId = crypto.randomUUID();
    folderIdMap.set(seedId, nextId);
    return nextId;
  };

  const folders: InfohubFolderRow[] = [
    ...initialLibraryFolders.map((folder, index) => ({
      id: createFolderId(folder.id),
      organization_id: organizationId,
      section: "library" as const,
      parent_id: folder.parentId ? folderIdMap.get(folder.parentId) ?? null : null,
      name: folder.name,
      sort_order: folder.sortOrder ?? index,
      access_scope: folder.access.accessScope,
      allowed_team_member_ids: folder.access.allowedTeamMemberIds,
      allowed_roles: folder.access.allowedRoles,
      allowed_location_ids: folder.access.allowedLocationIds,
      created_by: teamMemberId ?? null,
    })),
    ...initialTrainingFolders.map((folder, index) => ({
      id: createFolderId(folder.id),
      organization_id: organizationId,
      section: "training" as const,
      parent_id: folder.parentId ? folderIdMap.get(folder.parentId) ?? null : null,
      name: folder.name,
      sort_order: folder.sortOrder ?? index,
      access_scope: folder.access.accessScope,
      allowed_team_member_ids: folder.access.allowedTeamMemberIds,
      allowed_roles: folder.access.allowedRoles,
      allowed_location_ids: folder.access.allowedLocationIds,
      created_by: teamMemberId ?? null,
    })),
  ];

  const documents = [
    ...initialLibraryDocs.map((doc) => ({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      section: "library" as const,
      folder_id: folderIdMap.get(doc.folderId) ?? "",
      title: doc.title,
      summary: doc.summary,
      body: doc.content,
      metadata: {
        tags: doc.tags,
      },
      access_scope: doc.access.accessScope,
      allowed_team_member_ids: doc.access.allowedTeamMemberIds,
      allowed_roles: doc.access.allowedRoles,
      allowed_location_ids: doc.access.allowedLocationIds,
      created_by: teamMemberId ?? null,
    })),
    ...initialTrainingDocs.map((doc) => ({
      id: crypto.randomUUID(),
      organization_id: organizationId,
      section: "training" as const,
      folder_id: folderIdMap.get(doc.folderId) ?? "",
      title: doc.title,
      summary: `${doc.duration} module`,
      body: doc.steps.join("\n\n"),
      metadata: {
        duration: doc.duration,
        steps: doc.steps,
      },
      access_scope: doc.access.accessScope,
      allowed_team_member_ids: doc.access.allowedTeamMemberIds,
      allowed_roles: doc.access.allowedRoles,
      allowed_location_ids: doc.access.allowedLocationIds,
      created_by: teamMemberId ?? null,
    })),
  ];

  return { folders, documents };
}

function seedPayloadToContent(seed: InfohubSeedPayload): InfohubContentData {
  const now = new Date().toISOString();
  return {
    libraryFolders: seed.folders.filter((folder) => folder.section === "library").map(mapFolderRow),
    libraryDocs: seed.documents
      .filter((doc) => doc.section === "library")
      .map((doc) => mapLibraryDocRow({ ...doc, archived_at: null, updated_at: now })),
    archivedLibraryDocs: [],
    trainingFolders: seed.folders.filter((folder) => folder.section === "training").map(mapFolderRow),
    trainingDocs: seed.documents
      .filter((doc) => doc.section === "training")
      .map((doc) => mapTrainingDocRow({ ...doc, archived_at: null, updated_at: now })),
  };
}

function getDefaultContent(): InfohubContentData {
  return {
    libraryFolders: initialLibraryFolders,
    libraryDocs: initialLibraryDocs,
    archivedLibraryDocs: [],
    trainingFolders: initialTrainingFolders,
    trainingDocs: initialTrainingDocs,
  };
}

async function fetchInfohubContent(
  organizationId: string,
  canBootstrap: boolean,
  teamMemberId?: string | null,
): Promise<InfohubContentData> {
  const folderSelect = "id, organization_id, section, parent_id, name, sort_order, access_scope, allowed_team_member_ids, allowed_roles, allowed_location_ids";
  const docSelect = "id, organization_id, section, folder_id, title, summary, body, metadata, archived_at, access_scope, allowed_team_member_ids, allowed_roles, allowed_location_ids, updated_at";

  const [foldersRes, docsRes] = await Promise.all([
    supabase.from("infohub_folders").select(folderSelect).order("sort_order", { ascending: true }).order("name", { ascending: true }),
    supabase.from("infohub_documents").select(docSelect).order("updated_at", { ascending: false }),
  ]);

  if (foldersRes.error) throw foldersRes.error;
  if (docsRes.error) throw docsRes.error;

  let folders = (foldersRes.data ?? []) as InfohubFolderRow[];
  let documents = (docsRes.data ?? []) as InfohubDocumentRow[];

  if (folders.length === 0 && documents.length === 0 && canBootstrap) {
    const seed = buildSeedPayload(organizationId, teamMemberId);
    const { error: folderInsertError } = await supabase.from("infohub_folders").insert(seed.folders);
    if (folderInsertError) throw folderInsertError;
    const { error: docInsertError } = await supabase.from("infohub_documents").insert(seed.documents);
    if (docInsertError) throw docInsertError;

    const [seededFoldersRes, seededDocsRes] = await Promise.all([
      supabase.from("infohub_folders").select(folderSelect).order("sort_order", { ascending: true }).order("name", { ascending: true }),
      supabase.from("infohub_documents").select(docSelect).order("updated_at", { ascending: false }),
    ]);

    if (seededFoldersRes.error) throw seededFoldersRes.error;
    if (seededDocsRes.error) throw seededDocsRes.error;

    folders = (seededFoldersRes.data ?? []) as InfohubFolderRow[];
    documents = (seededDocsRes.data ?? []) as InfohubDocumentRow[];

    if (folders.length === 0 && documents.length === 0) {
      return seedPayloadToContent(seed);
    }
  }

  return {
    libraryFolders: folders.filter((folder) => folder.section === "library").map(mapFolderRow),
    libraryDocs: documents.filter((doc) => doc.section === "library" && !doc.archived_at).map(mapLibraryDocRow),
    archivedLibraryDocs: documents.filter((doc) => doc.section === "library" && !!doc.archived_at).map(mapLibraryDocRow),
    trainingFolders: folders.filter((folder) => folder.section === "training").map(mapFolderRow),
    trainingDocs: documents.filter((doc) => doc.section === "training" && !doc.archived_at).map(mapTrainingDocRow),
  };
}

function applyAccessFields(access: InfohubAccessControl) {
  return {
    access_scope: access.accessScope,
    allowed_team_member_ids: access.allowedTeamMemberIds,
    allowed_roles: access.allowedRoles,
    allowed_location_ids: access.allowedLocationIds,
  };
}

export function useInfohubContent() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  const organizationId = teamMember?.organization_id ?? null;
  const canBootstrap = canManageInfohubAccess({
    teamMemberId: teamMember?.id ?? null,
    role: teamMember?.role ?? null,
    locationIds: teamMember?.location_ids ?? [],
    permissions: teamMember?.permissions ?? null,
    isOwner: teamMember?.role === "Owner",
  });
  const queryKey = ["infohub-content", organizationId] as const;

  const query = useQuery({
    queryKey,
    enabled: !!organizationId,
    placeholderData: getDefaultContent(),
    queryFn: async () => {
      if (!organizationId) {
        return {
          libraryFolders: [],
          libraryDocs: [],
          archivedLibraryDocs: [],
          trainingFolders: [],
          trainingDocs: [],
        } satisfies InfohubContentData;
      }
      return fetchInfohubContent(organizationId, canBootstrap, teamMember?.id);
    },
  });

  const createFolder = useMutation({
    mutationFn: async (input: CreateFolderInput) => {
      if (!organizationId) throw new Error("Missing organization");
      const { error } = await supabase.from("infohub_folders").insert({
        organization_id: organizationId,
        section: input.section,
        parent_id: input.parentId,
        name: input.name,
        sort_order: null,
        ...applyAccessFields(DEFAULT_INFOHUB_ACCESS),
        created_by: teamMember?.id ?? null,
      });
      if (error) throw error;
    },
    onMutate: async (input) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      const nextFolder = {
        id: crypto.randomUUID(),
        name: input.name,
        parentId: input.parentId,
        sortOrder: null,
        access: DEFAULT_INFOHUB_ACCESS,
      };
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        return input.section === "library"
          ? { ...data, libraryFolders: [...data.libraryFolders, nextFolder] }
          : { ...data, trainingFolders: [...data.trainingFolders, nextFolder] };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const createDocument = useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      if (!organizationId) throw new Error("Missing organization");
      const payload = input.section === "library"
        ? {
            organization_id: organizationId,
            section: input.section,
            folder_id: input.folderId,
            title: input.title,
            summary: "New document — tap to edit.",
            body: "",
            metadata: { tags: input.tags ?? [] },
            ...applyAccessFields(DEFAULT_INFOHUB_ACCESS),
            created_by: teamMember?.id ?? null,
          }
        : {
            organization_id: organizationId,
            section: input.section,
            folder_id: input.folderId,
            title: input.title,
            summary: "5 min module",
            body: "",
            metadata: { duration: "5 min", steps: [] as string[] },
            ...applyAccessFields(DEFAULT_INFOHUB_ACCESS),
            created_by: teamMember?.id ?? null,
          };
      const { error } = await supabase.from("infohub_documents").insert(payload);
      if (error) throw error;
    },
    onMutate: async (input) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      const now = new Date().toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        if (input.section === "library") {
          return {
            ...data,
            libraryDocs: [
              ...data.libraryDocs,
              {
                id: crypto.randomUUID(),
                title: input.title,
                summary: "New document — tap to edit.",
                content: "",
                tags: input.tags ?? [],
                lastUpdated: now,
                folderId: input.folderId,
                access: DEFAULT_INFOHUB_ACCESS,
              },
            ],
          };
        }
        return {
          ...data,
          trainingDocs: [
            ...data.trainingDocs,
            {
              id: crypto.randomUUID(),
              title: input.title,
              duration: "5 min",
              completed: false,
              folderId: input.folderId,
              steps: [],
              access: DEFAULT_INFOHUB_ACCESS,
            },
          ],
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const updateFolder = useMutation({
    mutationFn: async (input: UpdateFolderInput) => {
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.parentId !== undefined) patch.parent_id = input.parentId;
      if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
      if (input.access) Object.assign(patch, applyAccessFields(input.access));
      const { error } = await supabase.from("infohub_folders").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        const updateItem = <T extends { id: string; name: string; parentId: string | null; sortOrder: number | null; access: InfohubAccessControl }>(items: T[]) =>
          items.map((item) => item.id === input.id ? {
            ...item,
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
            ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
            ...(input.access ? { access: input.access } : {}),
          } : item);
        return {
          ...data,
          libraryFolders: updateItem(data.libraryFolders),
          trainingFolders: updateItem(data.trainingFolders),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const updateDocument = useMutation({
    mutationFn: async (input: UpdateDocumentInput) => {
      const patch: Record<string, unknown> = {};
      if (input.folderId !== undefined) patch.folder_id = input.folderId;
      if (input.title !== undefined) patch.title = input.title;
      if (input.summary !== undefined) patch.summary = input.summary;
      if (input.body !== undefined) patch.body = input.body;
      if (input.access) Object.assign(patch, applyAccessFields(input.access));
      if (input.section === "library" && input.tags !== undefined) {
        patch.metadata = { tags: input.tags };
      }
      if (input.section === "training" && (input.duration !== undefined || input.steps !== undefined)) {
        patch.metadata = {
          duration: input.duration ?? "5 min",
          steps: input.steps ?? [],
        };
        if (input.body !== undefined && input.summary === undefined) {
          patch.summary = `${input.duration ?? "5 min"} module`;
        }
      }
      const { error } = await supabase.from("infohub_documents").update(patch).eq("id", input.id);
      if (error) throw error;
    },
    onMutate: async (input) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        const updateLibrary = data.libraryDocs.map((doc) => doc.id === input.id ? {
          ...doc,
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.body !== undefined ? { content: input.body } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.access ? { access: input.access } : {}),
          lastUpdated: formatDate(new Date().toISOString()),
        } : doc);
        const updateTraining = data.trainingDocs.map((doc) => doc.id === input.id ? {
          ...doc,
          ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.duration !== undefined ? { duration: input.duration } : {}),
          ...(input.steps !== undefined ? { steps: input.steps } : {}),
          ...(input.access ? { access: input.access } : {}),
        } : doc);
        return {
          ...data,
          libraryDocs: updateLibrary,
          archivedLibraryDocs: data.archivedLibraryDocs.map((doc) => doc.id === input.id && input.access ? { ...doc, access: input.access } : doc),
          trainingDocs: updateTraining,
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("infohub_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        return {
          ...data,
          libraryFolders: data.libraryFolders.filter((folder) => folder.id !== id),
          trainingFolders: data.trainingFolders.filter((folder) => folder.id !== id),
          libraryDocs: data.libraryDocs.filter((doc) => doc.folderId !== id),
          trainingDocs: data.trainingDocs.filter((doc) => doc.folderId !== id),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const archiveDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("infohub_documents").update({
        archived_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        const libraryDoc = data.libraryDocs.find((doc) => doc.id === id) ?? null;
        return {
          ...data,
          libraryDocs: data.libraryDocs.filter((doc) => doc.id !== id),
          archivedLibraryDocs: libraryDoc ? [...data.archivedLibraryDocs, libraryDoc] : data.archivedLibraryDocs,
          trainingDocs: data.trainingDocs.filter((doc) => doc.id !== id),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const restoreDocument = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("infohub_documents").update({
        archived_at: null,
      }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        const restoredDoc = data.archivedLibraryDocs.find((doc) => doc.id === id) ?? null;
        return {
          ...data,
          libraryDocs: restoredDoc ? [...data.libraryDocs, restoredDoc] : data.libraryDocs,
          archivedLibraryDocs: data.archivedLibraryDocs.filter((doc) => doc.id !== id),
        };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const reorderFolders = useMutation({
    mutationFn: async ({ section, orderedIds }: { section: InfohubSection; orderedIds: string[] }) => {
      await Promise.all(
        orderedIds.map(async (id, index) => {
          const { error } = await supabase
            .from("infohub_folders")
            .update({ sort_order: index })
            .eq("id", id);
          if (error) throw error;
        }),
      );
    },
    onMutate: async ({ section, orderedIds }) => {
      const previous = qc.getQueryData<InfohubContentData>(queryKey) ?? getDefaultContent();
      qc.setQueryData<InfohubContentData>(queryKey, (current) => {
        const data = current ?? previous;
        const reorder = <T extends { id: string; sortOrder: number | null }>(items: T[]) => {
          const itemMap = new Map(items.map((item) => [item.id, item]));
          return items.map((item) => itemMap.get(item.id) ?? item).map((item) => {
            const nextIndex = orderedIds.indexOf(item.id);
            return nextIndex === -1 ? item : { ...item, sortOrder: nextIndex };
          });
        };
        return section === "library"
          ? { ...data, libraryFolders: reorder(data.libraryFolders) }
          : { ...data, trainingFolders: reorder(data.trainingFolders) };
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    ...query,
    data: query.data ?? getDefaultContent(),
    createFolder,
    createDocument,
    updateFolder,
    updateDocument,
    deleteFolder,
    archiveDocument,
    restoreDocument,
    reorderFolders,
  };
}
