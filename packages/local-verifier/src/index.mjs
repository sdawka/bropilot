import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  CandidateBuildError,
  LIMITS,
  RUNTIME_CONFIG,
  VerifierInputError,
  buildCandidate,
  sha256,
  sortedRecord,
  validateSource,
} from "./build.mjs";

export const RUNNER_ID = "local-worker@1";
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER_FILES = [
  "package.json",
  "src/build.mjs",
  "src/cli.mjs",
  "src/index.mjs",
  "src/runner-child.mjs",
];
const ASSAY_IDS = ["artifact.exists", "artifact.build-start", "app.health", "app.surfaces"];

class VerifierAbortError extends Error {
  constructor() {
    super("verifier operation was stopped");
    this.name = "VerifierAbortError";
    this.code = "verifier_aborted";
  }
}

export function computeSourceDigest(source) {
  const files = validateSource(source);
  return sha256(JSON.stringify({ files: sortedRecord(files) }));
}

export async function getRunnerHash() {
  const entries = await Promise.all(
    RUNNER_FILES.map(async (name) => [name, await readFile(path.join(PACKAGE_ROOT, name), "utf8")]),
  );
  return sha256(JSON.stringify({ runnerId: RUNNER_ID, files: Object.fromEntries(entries) }));
}

function observation(assayId, executionStatus, result, summary, raw) {
  return {
    assayId,
    executionStatus,
    result,
    summary,
    ...(raw === undefined ? {} : { raw: raw.slice(0, LIMITS.maxRawBytes) }),
  };
}

function notRun(assayId, summary) {
  return observation(assayId, "notRun", "unknown", summary);
}

function completion(job, buildDigest, observations) {
  return {
    runId: job.runId,
    leaseId: job.leaseId,
    sourceDigest: job.sourceDigest,
    contractHash: job.contractHash,
    planHash: job.planHash,
    buildDigest,
    observations,
  };
}

function validateJob(job) {
  if (!job || typeof job !== "object") throw new VerifierInputError("invalid_job", "job must be an object");
  for (const field of ["worldId", "runId", "candidateId", "leaseId", "sourceDigest", "contractHash", "planHash", "runnerHash"]) {
    if (typeof job[field] !== "string" || job[field].length === 0) {
      throw new VerifierInputError("invalid_job", `${field} must be a non-empty string`);
    }
  }
}

function killProcessGroup(child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill("SIGKILL");
    else process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function runChild(payload, signal) {
  if (signal?.aborted) throw new VerifierAbortError();
  const child = spawn(process.execPath, [path.join(PACKAGE_ROOT, "src/runner-child.mjs")], {
    detached: process.platform !== "win32",
    env: {},
    stdio: ["pipe", "pipe", "pipe"],
  });
  let aborted = false;
  const abortChild = () => {
    aborted = true;
    killProcessGroup(child);
  };
  signal?.addEventListener("abort", abortChild, { once: true });
  if (signal?.aborted) abortChild();
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let outputExceeded = false;
  const append = (current, chunk) => {
    const next = Buffer.concat([current, chunk]);
    if (next.length > LIMITS.maxStdoutBytes) {
      outputExceeded = true;
      killProcessGroup(child);
      return next.subarray(0, LIMITS.maxStdoutBytes);
    }
    return next;
  };
  child.stdout.on("data", (chunk) => {
    stdout = append(stdout, chunk);
  });
  child.stderr.on("data", (chunk) => {
    stderr = append(stderr, chunk);
  });
  child.stdin.on("error", () => {});
  child.stdin.end(JSON.stringify(payload));

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killProcessGroup(child);
  }, LIMITS.childTimeoutMs);
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, childSignal) => resolve({ code, signal: childSignal }));
  }).finally(() => {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortChild);
  });
  killProcessGroup(child);
  if (aborted) throw new VerifierAbortError();
  if (timedOut) throw new Error("verifier child deadline exceeded");
  if (outputExceeded) throw new Error("verifier child output exceeded limit");
  if (result.code !== 0 && stdout.length === 0) {
    throw new Error(`verifier child failed (${result.code ?? result.signal}): ${stderr.toString("utf8").slice(0, 512)}`);
  }
  try {
    return JSON.parse(stdout.toString("utf8"));
  } catch {
    throw new Error("verifier child returned invalid bounded output");
  }
}

function probeRaw(probe) {
  return JSON.stringify(probe).slice(0, LIMITS.maxRawBytes);
}

function healthObservation(probe) {
  let parsed;
  try {
    parsed = JSON.parse(probe.body);
  } catch {
    parsed = null;
  }
  const passed = !probe.error && !probe.tooLarge && probe.status === 200 && parsed?.status === "ok";
  return observation(
    "app.health",
    "completed",
    passed ? "pass" : "fail",
    passed ? "GET /health returned the protected status contract" : "GET /health did not satisfy HTTP 200 JSON status ok",
    probeRaw(probe),
  );
}

function surfacesObservation(root, message) {
  let parsed;
  try {
    parsed = JSON.parse(message.body);
  } catch {
    parsed = null;
  }
  const rootPassed = !root.error && !root.tooLarge && root.status === 200 && root.contentType.includes("text/html") && root.body.length > 0;
  const apiPassed = !message.error && !message.tooLarge && message.status === 200 && typeof parsed?.message === "string" && parsed.message.length > 0;
  const passed = rootPassed && apiPassed;
  return observation(
    "app.surfaces",
    "completed",
    passed ? "pass" : "fail",
    passed ? "frontend and API surfaces satisfied the protected contracts" : "frontend or API surface did not satisfy its protected contract",
    `root=${probeRaw(root)} api=${probeRaw(message)}`,
  );
}

export async function verifyJob(job, options = {}) {
  const { signal } = options;
  if (signal?.aborted) throw new VerifierAbortError();
  validateJob(job);
  const files = validateSource(job.source);
  const runnerHash = await getRunnerHash();
  if (job.runnerHash !== runnerHash) {
    throw new VerifierInputError("runner_hash_mismatch", "job runnerHash does not match this executable verifier");
  }
  const sourceDigest = computeSourceDigest({ files });
  if (job.sourceDigest !== sourceDigest) {
    throw new VerifierInputError("source_digest_mismatch", "job sourceDigest does not match the immutable source bundle");
  }

  const missing = ["worker.ts", "public/index.html"].filter((name) => !Object.hasOwn(files, name));
  if (missing.length > 0) {
    return completion(job, null, [
      observation("artifact.exists", "completed", "fail", `required Kit paths are missing: ${missing.join(", ")}`),
      notRun("artifact.build-start", "build was not run because artifact inspection failed"),
      notRun("app.health", "health was not run because artifact inspection failed"),
      notRun("app.surfaces", "surface probes were not run because artifact inspection failed"),
    ]);
  }

  const exists = observation("artifact.exists", "completed", "pass", "required Kit paths are present");
  let built;
  try {
    built = await buildCandidate(files);
  } catch (error) {
    if (!(error instanceof CandidateBuildError)) throw error;
    return completion(job, null, [
      exists,
      observation("artifact.build-start", "completed", "fail", "candidate compilation failed", error.message),
      notRun("app.health", "health was not run because the candidate did not build"),
      notRun("app.surfaces", "surface probes were not run because the candidate did not build"),
    ]);
  }

  let childResult;
  try {
    childResult = await runChild({
      compiledOutput: built.compiledOutput,
      assets: built.assets,
      runtimeConfig: RUNTIME_CONFIG,
      limits: LIMITS,
    }, signal);
  } catch (error) {
    if (error instanceof VerifierAbortError) throw error;
    return completion(job, built.buildDigest, [
      exists,
      observation("artifact.build-start", "error", "unknown", "isolated verifier infrastructure failed; retry is allowed", error.message),
      notRun("app.health", "health was not run after verifier infrastructure error"),
      notRun("app.surfaces", "surface probes were not run after verifier infrastructure error"),
    ]);
  }
  if (childResult.status !== "ok") {
    const infrastructure = childResult.status === "infrastructureError";
    return completion(job, built.buildDigest, [
      exists,
      observation(
        "artifact.build-start",
        infrastructure ? "error" : "completed",
        infrastructure ? "unknown" : "fail",
        infrastructure ? "isolated verifier infrastructure failed; retry is allowed" : "candidate failed to start in workerd",
        childResult.error,
      ),
      notRun("app.health", "health was not run because the candidate did not start"),
      notRun("app.surfaces", "surface probes were not run because the candidate did not start"),
    ]);
  }

  return completion(job, built.buildDigest, [
    exists,
    observation("artifact.build-start", "completed", "pass", "candidate built and started in isolated workerd"),
    healthObservation(childResult.probes.health),
    surfacesObservation(childResult.probes.root, childResult.probes.message),
  ]);
}

export { ASSAY_IDS, LIMITS, VerifierAbortError, VerifierInputError };
