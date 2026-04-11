import type { FastifyInstance } from "fastify";
import { createHash, randomBytes } from "crypto";
import { db } from "../db/client";
import { agentTokens } from "../db/schema";
import { eq } from "drizzle-orm";
import { agentRegistry } from "../services/agent-registry";

function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export async function agentTokenRoutes(app: FastifyInstance) {
  // List all tokens with online status
  app.get("/", async () => {
    const tokens = await db
      .select({
        id: agentTokens.id,
        name: agentTokens.name,
        createdAt: agentTokens.createdAt,
        lastConnectedAt: agentTokens.lastConnectedAt,
      })
      .from(agentTokens)
      .orderBy(agentTokens.createdAt);

    return tokens.map((t) => ({
      ...t,
      online: agentRegistry.isOnline(t.id),
    }));
  });

  // Create a new token — returns the plain token once
  app.post<{ Body: { name: string } }>("/", async (req, reply) => {
    const { name } = req.body;
    if (!name?.trim()) {
      return reply.status(400).send({ error: "name is required" });
    }

    const plain = `ft_${randomBytes(24).toString("hex")}`;
    const tokenHash = hashToken(plain);

    const [created] = await db
      .insert(agentTokens)
      .values({ name: name.trim(), tokenHash })
      .returning({
        id: agentTokens.id,
        name: agentTokens.name,
        createdAt: agentTokens.createdAt,
      });

    return reply.status(201).send({ ...created, token: plain });
  });

  // Revoke a token
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    await db.delete(agentTokens).where(eq(agentTokens.id, req.params.id));
    agentRegistry.disconnect(req.params.id);
    return reply.status(204).send();
  });
}
