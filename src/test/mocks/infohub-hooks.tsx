import { useState } from "react";
import {
  DEFAULT_INFOHUB_ACCESS,
  type InfohubAccessControl,
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

type MockContent = {
  libraryFolders: InfohubLibraryFolder[];
  libraryDocs: InfohubLibraryDoc[];
  archivedLibraryDocs: InfohubLibraryDoc[];
  trainingFolders: InfohubTrainingFolder[];
  trainingDocs: InfohubTrainingDoc[];
};

type TrainingProgressRow = {
  module_id: string;
  is_completed: boolean;
};

const defaultContent = (): MockContent => ({
  libraryFolders: structuredClone(initialLibraryFolders),
  libraryDocs: structuredClone(initialLibraryDocs),
  archivedLibraryDocs: [],
  trainingFolders: structuredClone(initialTrainingFolders),
  trainingDocs: structuredClone(initialTrainingDocs),
});

let mockContentState = defaultContent();
let mockTrainingProgressState: TrainingProgressRow[] = [];

function createMutation<T>(update: React.Dispatch<React.SetStateAction<MockContent>>, fn: (input: T) => void) {
  return {
    mutate: (input: T) => {
      update((current) => {
        mockContentState = current;
        fn(input);
        return { ...mockContentState };
      });
    },
  };
}

function formatDate(date = new Date()) {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function resetInfohubMockState() {
  mockContentState = defaultContent();
  mockTrainingProgressState = [];
}

export function useMockInfohubContent() {
  const [data, setData] = useState<MockContent>(mockContentState);
  mockContentState = data;

  return {
    data,
    createFolder: createMutation(setData, ({ section, name, parentId }: { section: "library" | "training"; name: string; parentId: string | null }) => {
      const nextFolder = {
        id: crypto.randomUUID(),
        name,
        parentId,
        sortOrder: null,
        access: DEFAULT_INFOHUB_ACCESS,
      };
      mockContentState = section === "library"
        ? { ...mockContentState, libraryFolders: [...mockContentState.libraryFolders, nextFolder] }
        : { ...mockContentState, trainingFolders: [...mockContentState.trainingFolders, nextFolder] };
    }),
    createDocument: createMutation(setData, ({ section, title, folderId, tags = [] }: { section: "library" | "training"; title: string; folderId: string; tags?: string[] }) => {
      if (section === "library") {
        mockContentState = {
          ...mockContentState,
          libraryDocs: [
            ...mockContentState.libraryDocs,
            {
              id: crypto.randomUUID(),
              title,
              summary: "New document — tap to edit.",
              content: "",
              tags,
              lastUpdated: formatDate(),
              folderId,
              access: DEFAULT_INFOHUB_ACCESS,
            },
          ],
        };
        return;
      }

      mockContentState = {
        ...mockContentState,
        trainingDocs: [
          ...mockContentState.trainingDocs,
          {
            id: crypto.randomUUID(),
            title,
            duration: "5 min",
            completed: false,
            folderId,
            steps: [],
            access: DEFAULT_INFOHUB_ACCESS,
          },
        ],
      };
    }),
    updateFolder: createMutation(setData, ({ id, name, parentId, sortOrder, access }: { id: string; name?: string; parentId?: string | null; sortOrder?: number | null; access?: InfohubAccessControl }) => {
      const updateItems = <T extends { id: string; name: string; parentId: string | null; sortOrder: number | null; access: InfohubAccessControl }>(items: T[]) =>
        items.map((item) => item.id === id ? {
          ...item,
          ...(name !== undefined ? { name } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
          ...(sortOrder !== undefined ? { sortOrder } : {}),
          ...(access ? { access } : {}),
        } : item);

      mockContentState = {
        ...mockContentState,
        libraryFolders: updateItems(mockContentState.libraryFolders),
        trainingFolders: updateItems(mockContentState.trainingFolders),
      };
    }),
    updateDocument: createMutation(setData, ({ id, section, folderId, title, summary, body, tags, duration, steps, access }: {
      id: string;
      section: "library" | "training";
      folderId?: string;
      title?: string;
      summary?: string;
      body?: string;
      tags?: string[];
      duration?: string;
      steps?: string[];
      access?: InfohubAccessControl;
    }) => {
      if (section === "library") {
        mockContentState = {
          ...mockContentState,
          libraryDocs: mockContentState.libraryDocs.map((doc) => doc.id === id ? {
            ...doc,
            ...(folderId !== undefined ? { folderId } : {}),
            ...(title !== undefined ? { title } : {}),
            ...(summary !== undefined ? { summary } : {}),
            ...(body !== undefined ? { content: body } : {}),
            ...(tags !== undefined ? { tags } : {}),
            ...(access ? { access } : {}),
            lastUpdated: formatDate(),
          } : doc),
          archivedLibraryDocs: mockContentState.archivedLibraryDocs.map((doc) => doc.id === id && access ? { ...doc, access } : doc),
        };
        return;
      }

      mockContentState = {
        ...mockContentState,
        trainingDocs: mockContentState.trainingDocs.map((doc) => doc.id === id ? {
          ...doc,
          ...(folderId !== undefined ? { folderId } : {}),
          ...(title !== undefined ? { title } : {}),
          ...(duration !== undefined ? { duration } : {}),
          ...(steps !== undefined ? { steps } : {}),
          ...(access ? { access } : {}),
        } : doc),
      };
    }),
    deleteFolder: createMutation(setData, (id: string) => {
      mockContentState = {
        ...mockContentState,
        libraryFolders: mockContentState.libraryFolders.filter((folder) => folder.id !== id),
        trainingFolders: mockContentState.trainingFolders.filter((folder) => folder.id !== id),
        libraryDocs: mockContentState.libraryDocs.filter((doc) => doc.folderId !== id),
        trainingDocs: mockContentState.trainingDocs.filter((doc) => doc.folderId !== id),
      };
    }),
    archiveDocument: createMutation(setData, (id: string) => {
      const doc = mockContentState.libraryDocs.find((item) => item.id === id) ?? null;
      mockContentState = {
        ...mockContentState,
        libraryDocs: mockContentState.libraryDocs.filter((item) => item.id !== id),
        archivedLibraryDocs: doc ? [...mockContentState.archivedLibraryDocs, doc] : mockContentState.archivedLibraryDocs,
        trainingDocs: mockContentState.trainingDocs.filter((item) => item.id !== id),
      };
    }),
    restoreDocument: createMutation(setData, (id: string) => {
      const doc = mockContentState.archivedLibraryDocs.find((item) => item.id === id) ?? null;
      mockContentState = {
        ...mockContentState,
        libraryDocs: doc ? [...mockContentState.libraryDocs, doc] : mockContentState.libraryDocs,
        archivedLibraryDocs: mockContentState.archivedLibraryDocs.filter((item) => item.id !== id),
      };
    }),
    reorderFolders: createMutation(setData, ({ section, orderedIds }: { section: "library" | "training"; orderedIds: string[] }) => {
      const reorder = <T extends { id: string; sortOrder: number | null }>(items: T[]) =>
        items.map((item) => {
          const index = orderedIds.indexOf(item.id);
          return index === -1 ? item : { ...item, sortOrder: index };
        });
      mockContentState = section === "library"
        ? { ...mockContentState, libraryFolders: reorder(mockContentState.libraryFolders) }
        : { ...mockContentState, trainingFolders: reorder(mockContentState.trainingFolders) };
    }),
  };
}

export function useMockTrainingProgress() {
  const [rows, setRows] = useState<TrainingProgressRow[]>(mockTrainingProgressState);
  mockTrainingProgressState = rows;

  return {
    data: rows,
    saveProgress: {
      mutate: ({ moduleId, completedStepIndices, totalSteps }: { moduleId: string; completedStepIndices: number[]; totalSteps: number }) => {
        const isCompleted = totalSteps > 0 && completedStepIndices.length >= totalSteps;
        setRows((current) => {
          const next = [
            { module_id: moduleId, is_completed: isCompleted },
            ...current.filter((row) => row.module_id !== moduleId),
          ];
          mockTrainingProgressState = next;
          return next;
        });
      },
    },
  };
}
