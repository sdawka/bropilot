/// <reference types="node" />
/**
 * Node-only default `ReviewModel`: the `claude` CLI in print mode, as in the 2026-11-17 experiment. Tools, MCP servers,
 * settings and session persistence are off and it runs from an empty temp directory, so the prompt is the only
 * context. Replace this file to use another provider.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewModel } from "./review";

export function claudeModel(model = "opus", timeoutMs = 600_000): ReviewModel {
  return async (prompt) => {
    const cwd = mkdtempSync(join(tmpdir(), "review-empty-"));
    try {
      const r = spawnSync("claude", [
        "-p", "--model", model, "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--setting-sources", "", "--output-format", "json",
      ], { cwd, input: prompt, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 });
      if (r.error) throw r.error;
      if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${(r.stderr || r.stdout).trim().slice(0, 500)}`);
      const out = JSON.parse(r.stdout);
      if (out.is_error) throw new Error(`claude reported an error: ${String(out.result).slice(0, 500)}`);
      return { text: String(out.result ?? ""), ...(typeof out.total_cost_usd === "number" && { costUsd: out.total_cost_usd }) };
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  };
}
