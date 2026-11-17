// Lets Node run the package's TypeScript sources directly: extensionless relative imports resolve to `.ts` or `/index.ts`.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    if (!/^\.\.?\//.test(specifier) || /\.[cm]?[jt]s$/.test(specifier)) return next(specifier, context);
    for (const suffix of [".ts", "/index.ts"]) {
      try { return next(specifier + suffix, context); } catch {}
    }
    return next(specifier, context);
  },
});
