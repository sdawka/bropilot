import { Hono } from "hono";
import type { Crud } from "./crud.js";

/**
 * Create Hono routes for a CRUD collection.
 *
 * Routes:
 *   POST   /:collection      → create
 *   GET    /:collection/:id  → read
 *   PUT    /:collection/:id  → update
 *   DELETE /:collection/:id  → delete
 *   GET    /:collection      → list (with query params for filter/pagination)
 *
 * Response shapes match the Elixir API contract:
 *   { ok: true, data: ... } or { ok: false, error: "..." }
 */
export function crudRoutes(crud: Crud, collection: string): Hono {
  const app = new Hono();

  // List with optional filter and pagination
  app.get(`/${collection}`, async (c) => {
    const query = c.req.query();
    const page = query["page"] ? parseInt(query["page"], 10) : undefined;
    const pageSize = query["pageSize"] ? parseInt(query["pageSize"], 10) : undefined;

    // All other query params are treated as filters
    const filter: { [key: string]: unknown } = {};
    for (const [key, value] of Object.entries(query)) {
      if (key !== "page" && key !== "pageSize") {
        filter[key] = value;
      }
    }

    const hasFilter = Object.keys(filter).length > 0;
    const result = await crud.list(collection, {
      filter: hasFilter ? filter : undefined,
      page,
      pageSize,
    });

    return c.json(result);
  });

  // Create
  app.post(`/${collection}`, async (c) => {
    const body = await c.req.json();
    const result = await crud.create(collection, body);
    const status = result.ok ? 201 : 422;
    return c.json(result, status);
  });

  // Read
  app.get(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    const result = await crud.read(collection, id);
    const status = result.ok ? 200 : 404;
    return c.json(result, status);
  });

  // Update
  app.put(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json();
    const result = await crud.update(collection, id, body);
    if (!result.ok) {
      const status = "errors" in result ? 422 : 404;
      return c.json(result, status);
    }
    return c.json(result);
  });

  // Delete
  app.delete(`/${collection}/:id`, async (c) => {
    const id = c.req.param("id");
    const result = await crud.delete(collection, id);
    const status = result.ok ? 200 : 404;
    return c.json(result, status);
  });

  return app;
}
