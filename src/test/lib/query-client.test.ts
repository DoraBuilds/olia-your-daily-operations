import { queryClient } from "@/lib/query-client";

describe("queryClient", () => {
  it("is exported", () => {
    expect(queryClient).toBeDefined();
  });

  it("is an object", () => {
    expect(typeof queryClient).toBe("object");
  });

  it("has getQueryData function", () => {
    expect(typeof queryClient.getQueryData).toBe("function");
  });

  it("has setQueryData function", () => {
    expect(typeof queryClient.setQueryData).toBe("function");
  });

  it("has invalidateQueries function", () => {
    expect(typeof queryClient.invalidateQueries).toBe("function");
  });

  it("has prefetchQuery function", () => {
    expect(typeof queryClient.prefetchQuery).toBe("function");
  });

  it("getQueryData returns undefined for unknown key", () => {
    const result = queryClient.getQueryData(["nonexistent-key-xyz"]);
    expect(result).toBeUndefined();
  });

  it("can set and get query data", () => {
    queryClient.setQueryData(["test-key"], { value: 42 });
    const result = queryClient.getQueryData(["test-key"]);
    expect(result).toEqual({ value: 42 });
    // cleanup
    queryClient.removeQueries({ queryKey: ["test-key"] });
  });
});
