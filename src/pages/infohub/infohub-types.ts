export type SubTab = "library" | "training";

export type AccessTarget = {
  id: string;
  type: "folder" | "doc";
  section: "library" | "training";
  name: string;
};
