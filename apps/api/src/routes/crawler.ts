import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { environments, selectorRegistries } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { crawl } from "../services/crawler";
import { decryptAuth } from "../services/encryption";
import type { EnvironmentAuth, CrawlResponse } from "@flowright/shared";

export async function crawlerRoutes(app: FastifyInstance) {
  // Trigger a crawl for an environment
  app.post<{ Body: { environmentId: string } }>(
    "/crawl",
    async (req, reply) => {
      const { environmentId } = req.body;

      if (!environmentId) {
        return reply.status(400).send({ error: "environmentId is required" });
      }

      // Load environment
      const [env] = await db
        .select()
        .from(environments)
        .where(eq(environments.id, environmentId));

      if (!env) {
        return reply.status(404).send({ error: "Environment not found" });
      }

      // Decrypt auth before passing to crawler
      const auth = decryptAuth(env.auth as EnvironmentAuth);

      // Check SSO session freshness
      if (auth.type === "sso" && auth.capturedAt) {
        const capturedAt = new Date(auth.capturedAt);
        const ageHours = (Date.now() - capturedAt.getTime()) / 1000 / 60 / 60;
        const ttlHours = Number(process.env.SSO_SESSION_TTL_HOURS ?? 8);

        if (ageHours > ttlHours) {
          return reply.status(400).send({
            error: "SSO session has expired. Please re-capture the session before crawling.",
            capturedAt: auth.capturedAt,
            ageHours: Math.round(ageHours),
          });
        }
      }

      try {
        const result = await crawl({
          baseUrl: env.baseUrl,
          seedUrls: (env.seedUrls as string[]) ?? [],
          auth,
        });

        // Save registry
        const [registry] = await db
          .insert(selectorRegistries)
          .values({
            environmentId,
            entries: result.entries,
            crawledAt: new Date(result.crawledAt),
          })
          .returning();

        const response: CrawlResponse = {
          registryId: registry.id,
          entriesFound: result.entries.length,
          crawledAt: result.crawledAt,
        };

        return reply.status(201).send(response);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Crawl failed";
        app.log.error({ err }, "Crawl failed");
        return reply.status(500).send({ error: message });
      }
    }
  );

  // Get latest registry for an environment
  app.get<{ Params: { environmentId: string } }>(
    "/registry/:environmentId",
    async (req, reply) => {
      const [registry] = await db
        .select()
        .from(selectorRegistries)
        .where(eq(selectorRegistries.environmentId, req.params.environmentId))
        .orderBy(desc(selectorRegistries.crawledAt))
        .limit(1);

      if (!registry) {
        return reply.status(404).send({ error: "No registry found. Run a crawl first." });
      }

      return {
        ...registry,
        entriesCount: (registry.entries as unknown[]).length,
      };
    }
  );

  // List all registries for an environment (crawl history)
  app.get<{ Params: { environmentId: string } }>(
    "/registry/:environmentId/history",
    async (req) => {
      const rows = await db
        .select({
          id: selectorRegistries.id,
          environmentId: selectorRegistries.environmentId,
          crawledAt: selectorRegistries.crawledAt,
        })
        .from(selectorRegistries)
        .where(eq(selectorRegistries.environmentId, req.params.environmentId))
        .orderBy(desc(selectorRegistries.crawledAt));

      return rows;
    }
  );
}
