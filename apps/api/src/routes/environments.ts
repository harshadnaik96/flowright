import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { environments, selectorRegistries } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { encryptAuth, decryptAuth } from "../services/encryption";
import type { CreateEnvironmentRequest, EnvironmentAuth } from "@flowright/shared";

// Strip sensitive fields before sending to client
function sanitizeAuth(auth: EnvironmentAuth): EnvironmentAuth {
  const safe = { ...auth };
  const sensitiveFields: (keyof EnvironmentAuth)[] = [
    "phoneNumber", "otp", "mpin", "password", "storageState", "loginScript",
  ];
  for (const field of sensitiveFields) {
    if (safe[field]) {
      (safe as Record<string, unknown>)[field] = "••••••••";
    }
  }
  // Expose only last 4 digits of username if present
  if (safe.username && safe.username !== "••••••••") {
    safe.username = `••••${safe.username.slice(-4)}`;
  }
  return safe;
}

export async function environmentRoutes(app: FastifyInstance) {
  // List environments for a project
  app.get<{ Params: { projectId: string } }>(
    "/projects/:projectId/environments",
    async (req, reply) => {
      const rows = await db
        .select()
        .from(environments)
        .where(eq(environments.projectId, req.params.projectId))
        .orderBy(environments.createdAt);

      return rows.map((row) => ({
        ...row,
        auth: sanitizeAuth(row.auth as EnvironmentAuth),
        seedUrls: row.seedUrls as string[],
      }));
    }
  );

  // Get single environment
  app.get<{ Params: { projectId: string; id: string } }>(
    "/projects/:projectId/environments/:id",
    async (req, reply) => {
      const [row] = await db
        .select()
        .from(environments)
        .where(eq(environments.id, req.params.id));

      if (!row) return reply.status(404).send({ error: "Environment not found" });

      // Include latest registry metadata
      const [latestRegistry] = await db
        .select({ id: selectorRegistries.id, crawledAt: selectorRegistries.crawledAt })
        .from(selectorRegistries)
        .where(eq(selectorRegistries.environmentId, row.id))
        .orderBy(desc(selectorRegistries.crawledAt))
        .limit(1);

      return {
        ...row,
        auth: sanitizeAuth(row.auth as EnvironmentAuth),
        seedUrls: row.seedUrls as string[],
        registry: latestRegistry ?? null,
      };
    }
  );

  // Create environment
  app.post<{
    Params: { projectId: string };
    Body: CreateEnvironmentRequest;
  }>("/projects/:projectId/environments", async (req, reply) => {
    const { name, baseUrl, auth, seedUrls = [] } = req.body;

    if (!name?.trim()) return reply.status(400).send({ error: "name is required" });
    if (!baseUrl?.trim()) return reply.status(400).send({ error: "baseUrl is required" });

    const encryptedAuth = encryptAuth(auth ?? { type: "none" });

    const [created] = await db
      .insert(environments)
      .values({
        projectId: req.params.projectId,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        auth: encryptedAuth,
        seedUrls,
      })
      .returning();

    return reply.status(201).send({
      ...created,
      auth: sanitizeAuth(auth),
      seedUrls,
    });
  });

  // Update environment
  app.put<{
    Params: { projectId: string; id: string };
    Body: Partial<CreateEnvironmentRequest>;
  }>("/projects/:projectId/environments/:id", async (req, reply) => {
    const { name, baseUrl, auth, seedUrls } = req.body;

    const encryptedAuth = auth ? encryptAuth(auth) : undefined;

    const [updated] = await db
      .update(environments)
      .set({
        ...(name && { name: name.trim() }),
        ...(baseUrl && { baseUrl: baseUrl.trim() }),
        ...(encryptedAuth && { auth: encryptedAuth }),
        ...(seedUrls !== undefined && { seedUrls }),
      })
      .where(eq(environments.id, req.params.id))
      .returning();

    if (!updated) return reply.status(404).send({ error: "Environment not found" });

    return {
      ...updated,
      auth: sanitizeAuth(auth ?? (updated.auth as EnvironmentAuth)),
      seedUrls: updated.seedUrls as string[],
    };
  });

  // Delete environment
  app.delete<{ Params: { projectId: string; id: string } }>(
    "/projects/:projectId/environments/:id",
    async (req, reply) => {
      const [deleted] = await db
        .delete(environments)
        .where(eq(environments.id, req.params.id))
        .returning();

      if (!deleted) return reply.status(404).send({ error: "Environment not found" });
      return reply.status(204).send();
    }
  );
}
