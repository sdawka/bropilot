#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { getRunnerHash, verifyJob } from "./index.mjs";

const API_TIMEOUT_MS = 3_000;
const WATCH_POLL_MS = 1_000;
const WATCH_RETRY_MAX_MS = 2_000;

class ApiRequestError extends Error {
  constructor(message = "verifier API request failed", retryable = true) {
    super(message);
    this.name = "ApiRequestError";
    this.code = "api_request_failed";
    this.retryable = retryable;
  }
}

function parseArgs(argv) {
  const options = { watch: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--watch") options.watch = true;
    else if (arg === "--origin" || arg === "--token-file") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${arg} requires a value`);
      options[arg === "--origin" ? "origin" : "tokenFile"] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!options.origin || !options.tokenFile) {
    throw new Error("usage: bropilot-local-verifier --origin <loopbackURL> --token-file <privateFile> [--watch]");
  }
  const origin = new URL(options.origin);
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (!loopback.has(origin.hostname) || !["http:", "https:"].includes(origin.protocol)) {
    throw new Error("--origin must be an HTTP(S) loopback URL");
  }
  options.origin = origin.origin;
  return options;
}

async function readPrivateToken(filename) {
  const metadata = await stat(filename);
  if (!metadata.isFile()) throw new Error("token file must be a regular file");
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("token file permissions must not grant group or other access");
  }
  const token = await readFile(filename, "utf8");
  if (token.length === 0 || /[\r\n]/.test(token)) throw new Error("token file must contain one non-empty raw token");
  return token;
}

async function requestJson(url, token, runnerHash, init = {}, shutdownSignal) {
  const timeoutSignal = AbortSignal.timeout(API_TIMEOUT_MS);
  const signal = shutdownSignal ? AbortSignal.any([shutdownSignal, timeoutSignal]) : timeoutSignal;
  let response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-bropilot-runner-hash": runnerHash,
        ...init.headers,
      },
      signal,
    });
  } catch {
    throw new ApiRequestError();
  }
  if (response.status === 409) return { busy: true };
  if (!response.ok) {
    throw new ApiRequestError(`verifier API returned HTTP ${response.status}`, response.status >= 500);
  }
  try {
    return await response.json();
  } catch {
    throw new ApiRequestError("verifier API returned invalid JSON");
  }
}

async function processOnce(origin, token, runnerHash, signal) {
  const listing = await requestJson(`${origin}/api/v1/local-verifier/jobs`, token, runnerHash, {}, signal);
  const jobs = Array.isArray(listing.jobs) ? listing.jobs : [];
  for (const queued of jobs) {
    if (typeof queued?.worldId !== "string" || typeof queued?.runId !== "string") continue;
    const base = `${origin}/api/v1/worlds/${encodeURIComponent(queued.worldId)}/runs/${encodeURIComponent(queued.runId)}`;
    const claimed = await requestJson(`${base}/claim`, token, runnerHash, {
      method: "POST",
      body: JSON.stringify({ runnerHash }),
    }, signal);
    if (claimed.busy) continue;
    const completion = await verifyJob(claimed.job, { signal });
    await requestJson(`${base}/complete`, token, runnerHash, {
      method: "POST",
      body: JSON.stringify(completion),
    }, signal);
    process.stdout.write(`completed ${queued.worldId}/${queued.runId}\n`);
  }
}

async function interruptibleDelay(milliseconds, signal) {
  if (signal.aborted) return;
  await new Promise((resolve) => {
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const token = await readPrivateToken(options.tokenFile);
  const runnerHash = await getRunnerHash();
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let retryDelay = 250;
  try {
    do {
      try {
        await processOnce(options.origin, token, runnerHash, shutdown.signal);
        retryDelay = 250;
        if (options.watch && !shutdown.signal.aborted) {
          await interruptibleDelay(WATCH_POLL_MS, shutdown.signal);
        }
      } catch (error) {
        if (shutdown.signal.aborted) break;
        if (!options.watch || !(error instanceof ApiRequestError) || !error.retryable) throw error;
        process.stderr.write("local verifier watch retry: API unavailable\n");
        await interruptibleDelay(retryDelay, shutdown.signal);
        retryDelay = Math.min(retryDelay * 2, WATCH_RETRY_MAX_MS);
      }
    } while (options.watch && !shutdown.signal.aborted);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`local verifier error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
