/**
 * pdfjs-dist relies on Promise.withResolvers(), which Safari only shipped in
 * 17.4 (Mar 2024). On older Safari it's undefined, so pdf.js throws
 * "undefined is not a function" the moment it's called — on both the main
 * thread (pdfjs-dist's public API) and inside its worker (a separate global
 * scope), so this must run in both places.
 */
export function ensurePromiseWithResolvers(): void {
  if (typeof (Promise as any).withResolvers === "function") return;
  (Promise as any).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
