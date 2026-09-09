import { ensurePromiseWithResolvers } from "@/lib/promise-with-resolvers-polyfill";

describe("ensurePromiseWithResolvers", () => {
  const original = (Promise as any).withResolvers;

  afterEach(() => {
    if (original) {
      (Promise as any).withResolvers = original;
    } else {
      delete (Promise as any).withResolvers;
    }
  });

  it("installs a working polyfill when Promise.withResolvers is missing", async () => {
    delete (Promise as any).withResolvers;
    ensurePromiseWithResolvers();

    const { promise, resolve } = (Promise as any).withResolvers();
    resolve("done");
    await expect(promise).resolves.toBe("done");
  });

  it("does not overwrite an existing native implementation", () => {
    const native = () => "native";
    (Promise as any).withResolvers = native;
    ensurePromiseWithResolvers();
    expect((Promise as any).withResolvers).toBe(native);
  });
});
