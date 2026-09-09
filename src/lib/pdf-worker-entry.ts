import { ensurePromiseWithResolvers } from "./promise-with-resolvers-polyfill";
import "pdfjs-dist/build/pdf.worker.min.mjs";

// Runs in the pdf.js worker's own global scope (a separate realm from the
// main thread), so the polyfill has to be applied here too. ES module
// dependencies fully evaluate before the importing module's own top-level
// code, regardless of where the import statement sits in the file — but
// pdf.worker.min.mjs only calls Promise.withResolvers() from inside class
// constructors/methods invoked later (once the main thread starts sending
// messages), never at its own top level, so applying the polyfill here,
// after that import, still runs before it's ever needed. (A dynamic
// `import()` here would force Rollup's worker bundle into code-splitting,
// which isn't supported for the iife/umd format Vite builds workers with.)
ensurePromiseWithResolvers();
