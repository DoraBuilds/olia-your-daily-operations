import { useState } from "react";

import type { InfohubLibraryDoc as DocItem, InfohubLibraryFolder as FolderItem, InfohubTrainingDoc as TrainingDoc, InfohubTrainingFolder as TrainingFolder } from "@/lib/infohub-catalog";

export function sortFolders<T extends { name: string; sortOrder: number | null }>(folders: T[]): T[] {
  return [...folders].sort((a, b) => {
    if (a.sortOrder !== null && b.sortOrder !== null) return a.sortOrder - b.sortOrder;
    if (a.sortOrder !== null) return -1;
    if (b.sortOrder !== null) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function countDocsInFolder(folderId: string, folders: FolderItem[], docs: DocItem[]): number {
  const directDocs = docs.filter((doc) => doc.folderId === folderId).length;
  const childFolders = folders.filter((folder) => folder.parentId === folderId);
  return directDocs + childFolders.reduce((sum, childFolder) => sum + countDocsInFolder(childFolder.id, folders, docs), 0);
}

export function countTrainingDocsInFolder(folderId: string, folders: TrainingFolder[], docs: TrainingDoc[]): number {
  const directDocs = docs.filter((doc) => doc.folderId === folderId).length;
  const childFolders = folders.filter((folder) => folder.parentId === folderId);
  return directDocs + childFolders.reduce((sum, childFolder) => sum + countTrainingDocsInFolder(childFolder.id, folders, docs), 0);
}

export function useDragReorder<T extends { id: string }>(items: T[], onReorder: (reordered: T[]) => void) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const reordered = [...items];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(idx, 0, moved);
    onReorder(reordered);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);
  return { dragIdx, handleDragStart, handleDragOver, handleDragEnd };
}
