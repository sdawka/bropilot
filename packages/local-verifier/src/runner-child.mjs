import { Log, LogLevel, Miniflare } from "miniflare";

const MAX_INPUT_BYTES = 256 * 1024;

async function readInput() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > MAX_INPUT_BYTES) throw new Error("runner input exceeded limit");
  }
  return JSON.parse(input);
}

function assetResponse(request, assets) {
  const pathname = new URL(request.url).pathname;
  const assetPath = pathname === "/" ? "public/index.html" : `public${pathname}`;
  const body = assets[assetPath];
  if (body === undefined) return new Response("Not found", { status: 404 });
  const contentType = assetPath.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream";
  return new Response(body, { headers: { "content-type": contentType } });
}

async function readBounded(response, maxResponseBytes, maxRawBytes) {
  const reader = response.body?.getReader();
  let total = 0;
  let rawTotal = 0;
  const rawChunks = [];
  let tooLarge = false;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (rawTotal < maxRawBytes) {
        const part = value.subarray(0, maxRawBytes - rawTotal);
        rawChunks.push(part);
        rawTotal += part.length;
      }
      total += value.byteLength;
      if (total > maxResponseBytes) {
        tooLarge = true;
        await reader.cancel();
        break;
      }
    }
  }
  const joined = new Uint8Array(rawTotal);
  let offset = 0;
  for (const chunk of rawChunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body: new TextDecoder().decode(joined),
    tooLarge,
  };
}

async function probe(mf, pathname, limits) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), limits.probeTimeoutMs);
  let deadline;
  try {
    const response = await Promise.race([
      mf.dispatchFetch(`http://candidate.local${pathname}`, { signal: controller.signal }),
      new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error("probe deadline exceeded")), limits.probeTimeoutMs);
      }),
    ]);
    return await readBounded(response, limits.maxResponseBytes, limits.maxRawBytes);
  } catch (error) {
    return { status: 0, contentType: "", body: "", tooLarge: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
    clearTimeout(deadline);
  }
}

async function main() {
  const { compiledOutput, assets, runtimeConfig, sandboxPolicy, limits } = await readInput();
  if (sandboxPolicy?.outboundNetwork !== "deny-all") {
    throw new Error("verifier sandbox must deny outbound network");
  }
  let mf;
  try {
    mf = new Miniflare({
      log: new Log(LogLevel.NONE),
      workers: [
        {
          config: {
            name: "candidate",
            compatibilityDate: runtimeConfig.compatibilityDate,
            compatibilityFlags: runtimeConfig.compatibilityFlags,
            triggers: [{ type: "fetch", pattern: "*" }],
            manifest: {
              mainModule: "worker.mjs",
              modulesRoot: "/candidate",
              modules: {
                "worker.mjs": { type: "esm", contents: compiledOutput },
              },
            },
            env: {
              ASSETS: { type: "fetcher", handler: (request) => assetResponse(request, assets) },
            },
          },
          dev: {
            outboundService: {
              type: "fetcher",
              handler: () => new Response("Outbound network denied by verifier", { status: 403 }),
            },
          },
        },
      ],
    });
    await mf.ready;
  } catch (error) {
    process.stdout.write(JSON.stringify({ status: "startError", error: error instanceof Error ? error.message : String(error) }));
    if (mf) await mf.dispose().catch(() => {});
    return;
  }

  const probes = {
    health: await probe(mf, "/health", limits),
    root: await probe(mf, "/", limits),
    message: await probe(mf, "/api/message", limits),
  };
  await mf.dispose();
  process.stdout.write(JSON.stringify({ status: "ok", probes }));
}

main().catch((error) => {
  process.stdout.write(JSON.stringify({ status: "infrastructureError", error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
