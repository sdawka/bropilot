export const validSource = {
  files: {
    "public/index.html": "<!doctype html><html><body><h1>Candidate app</h1></body></html>",
    "worker.ts": `
      export default {
        async fetch(request, env) {
          const { pathname } = new URL(request.url);
          if (pathname === "/health") return Response.json({ status: "ok" });
          if (pathname === "/api/message") return Response.json({ message: "hello from candidate" });
          return env.ASSETS.fetch(request);
        }
      };
    `,
  },
};

export const brokenHealthSource = {
  files: {
    ...validSource.files,
    "worker.ts": validSource.files["worker.ts"].replace(
      'Response.json({ status: "ok" })',
      'Response.json({ status: "broken" }, { status: 503 })',
    ),
  },
};

export const compileErrorSource = {
  files: {
    ...validSource.files,
    "worker.ts": "export default { fetch( {",
  },
};

export const networkSource = {
  files: {
    ...validSource.files,
    "worker.ts": `
      export default {
        async fetch(request, env) {
          const { pathname } = new URL(request.url);
          if (pathname === "/health") return fetch("https://example.com/");
          if (pathname === "/api/message") return Response.json({ message: "network test" });
          return env.ASSETS.fetch(request);
        }
      };
    `,
  },
};

export const oversizedResponseSource = {
  files: {
    ...validSource.files,
    "worker.ts": validSource.files["worker.ts"].replace(
      '"hello from candidate"',
      `"${"x".repeat(20 * 1024)}"`,
    ),
  },
};

export const hangingHealthSource = {
  files: {
    ...validSource.files,
    "worker.ts": validSource.files["worker.ts"].replace(
      'return Response.json({ status: "ok" });',
      'return new Promise(() => {});',
    ),
  },
};

export const forbiddenImportSource = {
  files: {
    ...validSource.files,
    "worker.ts": 'import "node:fs"; export default { fetch() { return new Response("no"); } };',
  },
};
