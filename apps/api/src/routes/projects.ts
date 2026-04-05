import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { projects } from "../db/schema";
import { eq } from "drizzle-orm";
import type { CreateProjectRequest } from "@flowright/shared";

export async function projectRoutes(app: FastifyInstance) {
  // List all projects
  app.get("/", async () => {
    return db.select().from(projects).orderBy(projects.createdAt);
  });

  // Get single project
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, req.params.id));

    if (!project) return reply.status(404).send({ error: "Project not found" });
    return project;
  });

  // Create project
  app.post<{ Body: CreateProjectRequest }>("/", async (req, reply) => {
    const { name, description } = req.body;

    if (!name?.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }

    const [created] = await db
      .insert(projects)
      .values({ name: name.trim(), description })
      .returning();

    return reply.status(201).send(created);
  });

  // Update project
  app.put<{ Params: { id: string }; Body: Partial<CreateProjectRequest> }>(
    "/:id",
    async (req, reply) => {
      const { name, description } = req.body;

      const [updated] = await db
        .update(projects)
        .set({
          ...(name && { name: name.trim() }),
          ...(description !== undefined && { description }),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, req.params.id))
        .returning();

      if (!updated) return reply.status(404).send({ error: "Project not found" });
      return updated;
    }
  );

  // Delete project
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const [deleted] = await db
      .delete(projects)
      .where(eq(projects.id, req.params.id))
      .returning();

    if (!deleted) return reply.status(404).send({ error: "Project not found" });
    return reply.status(204).send();
  });
}
