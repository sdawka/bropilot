import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

import { build } from "esbuild";

const require = createRequire(import.meta.url);
const esbuildVersion = require("esbuild/package.json").version;
const miniflareVersion = require("miniflare/package.json").version;
const workerdVersion = require("workerd/package.json").version;

export const LIMITS = Object.freeze({
  maxFiles: 64,
  maxSourceBytes: 64 * 1024,
  maxRawBytes: 8 * 1024,
  maxResponseBytes: 16 * 1024,
  maxStdoutBytes: 32 * 1024,
  probeTimeoutMs: 3_000,
  childTimeoutMs: 45_000,
});

export const RUNTIME_CONFIG = Object.freeze({
  compatibilityDate: "2026-10-08",
  compatibilityFlags: [],
  entrypoint: "worker.ts",
  assetsBinding: "ASSETS",
  nodejsCompat: false,
});

export const SANDBOX_POLICY = Object.freeze({
  outboundNetwork: "deny-all",
});

export const TOOLCHAIN = Object.freeze({
  esbuildVersion,
  miniflareVersion,
  workerdVersion,
});

export class VerifierInputError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "VerifierInputError";
    this.code = code;
  }
}

export class CandidateBuildError extends Error {
  constructor(message) {
    super(message);
    this.name = "CandidateBuildError";
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sortedRecord(record) {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
}

export function validateSource(source) {
  if (!source || typeof source !== "object" || !source.files || typeof source.files !== "object" || Array.isArray(source.files)) {
    throw new VerifierInputError("invalid_source", "source.files must be a record of UTF-8 text files");
  }
  const entries = Object.entries(source.files);
  if (entries.length === 0 || entries.length > LIMITS.maxFiles) {
    throw new VerifierInputError("source_limit", `source must contain 1 to ${LIMITS.maxFiles} files`);
  }
  let total = 0;
  for (const [name, contents] of entries) {
    if (
      typeof contents !== "string" ||
      name.length === 0 ||
      name.length > 256 ||
      !/^[\x20-\x7e]+$/.test(name) ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/")[0].includes(":") ||
      name.split("/").some(part => part === "" || part === "." || part === "..") ||
      path.posix.normalize(name) !== name ||
      name === ".." ||
      name.startsWith("../")
    ) {
      throw new VerifierInputError("invalid_source_path", `invalid source path: ${name}`);
    }
    total += Buffer.byteLength(name, "utf8") + Buffer.byteLength(contents, "utf8");
  }
  if (total > LIMITS.maxSourceBytes) {
    throw new VerifierInputError("source_limit", `source exceeds ${LIMITS.maxSourceBytes} UTF-8 bytes`);
  }
  return sortedRecord(source.files);
}

function resolveModule(specifier, importer, files) {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    throw new CandidateBuildError(`only relative source imports are allowed: ${specifier}`);
  }
  const importerDirectory = path.posix.dirname(importer);
  const candidate = path.posix.normalize(path.posix.join(importerDirectory, specifier));
  if (candidate.startsWith("../") || candidate === "..") {
    throw new CandidateBuildError(`source import escapes the bundle: ${specifier}`);
  }
  const choices = [candidate, `${candidate}.ts`, `${candidate}.js`, `${candidate}.mjs`];
  const resolved = choices.find((choice) => Object.hasOwn(files, choice));
  if (!resolved) throw new CandidateBuildError(`source import not found: ${specifier}`);
  return resolved;
}

export async function buildCandidate(files) {
  try {
    const result = await build({
      entryPoints: ["worker.ts"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      target: "es2022",
      legalComments: "none",
      logLevel: "silent",
      plugins: [
        {
          name: "bounded-memory-source",
          setup(buildContext) {
            buildContext.onResolve({ filter: /.*/ }, (args) => {
              if (args.kind === "entry-point") {
                if (!Object.hasOwn(files, args.path)) throw new CandidateBuildError("worker.ts is missing");
                return { path: args.path, namespace: "candidate" };
              }
              return {
                path: resolveModule(args.path, args.importer, files),
                namespace: "candidate",
              };
            });
            buildContext.onLoad({ filter: /.*/, namespace: "candidate" }, (args) => ({
              contents: files[args.path],
              loader: args.path.endsWith(".ts") ? "ts" : "js",
              resolveDir: path.posix.dirname(args.path),
            }));
          },
        },
      ],
    });
    const compiledOutput = result.outputFiles?.[0]?.text;
    if (!compiledOutput) throw new CandidateBuildError("esbuild produced no Worker module");
    if (/\bimport\s*\(/.test(compiledOutput)) {
      throw new CandidateBuildError("dynamic imports are not allowed in candidate Workers");
    }
    const assets = sortedRecord(
      Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith("public/"))),
    );
    const buildDigest = sha256(
      JSON.stringify({ compiledOutput, assets, runtimeConfig: RUNTIME_CONFIG }),
    );
    return { compiledOutput, assets, buildDigest };
  } catch (error) {
    if (error instanceof CandidateBuildError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CandidateBuildError(message);
  }
}
