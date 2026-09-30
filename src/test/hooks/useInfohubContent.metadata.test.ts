import { libraryMetadataWithTags } from "@/hooks/useInfohubContent";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("libraryMetadataWithTags", () => {
  it("keeps an uploaded file's path and type when its tags change", () => {
    expect(libraryMetadataWithTags(["Safety"], { filePath: "org1/1.pdf", fileType: "application/pdf" })).toEqual({
      tags: ["Safety"],
      filePath: "org1/1.pdf",
      fileType: "application/pdf",
    });
  });

  it("stores only tags for a written document", () => {
    expect(libraryMetadataWithTags(["Safety"], {})).toEqual({ tags: ["Safety"] });
    expect(libraryMetadataWithTags([])).toEqual({ tags: [] });
  });
});
