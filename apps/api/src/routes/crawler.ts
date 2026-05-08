import type { FastifyInstance } from "fastify";
import { db } from "../db/client";
import { environments, projects, selectorRegistries } from "../db/schema";
import { eq, desc } from "drizzle-orm";
import { crawl } from "../services/crawler";
import { crawlMobileApp, crawlSingleScreen } from "../services/crawler-maestro";
import { generateAuthSubflow } from "../services/auth-subflow";
import { decryptAuth } from "../services/encryption";
import type { EnvironmentAuth, CrawlResponse, MobileSelectorEntry } from "@flowright/shared";

export async function crawlerRoutes(app: FastifyInstance) {
  // Trigger a crawl for an environment
  app.post<{ Body: { environmentId: string } }>(
    "/crawl",
    async (req, reply) => {
      const { environmentId } = req.body;

      if (!environmentId) {
        return reply.status(400).send({ error: "environmentId is required" });
      }

      // Load environment + project (need platform)
      const [row] = await db
        .select({
          env: environments,
          platform: projects.platform,
        })
        .from(environments)
        .innerJoin(projects, eq(environments.projectId, projects.id))
        .where(eq(environments.id, environmentId));

      if (!row) {
        return reply.status(404).send({ error: "Environment not found" });
      }

      const { env, platform } = row;

      // Decrypt auth before use
      const auth = decryptAuth(env.auth as EnvironmentAuth);

      // ── Mobile path ────────────────────────────────────────────────────────
      if (platform === "android" || platform === "ios") {
        const appId = env.baseUrl; // mobile environments store appId in baseUrl

        try {
          const result = await crawlMobileApp(appId);

          // Generate auth subflow if auth is configured for this environment
          let authSubflowPath: string | null = null;
          try {
            authSubflowPath = await generateAuthSubflow(env.id, appId, auth);
            if (authSubflowPath) {
              await db
                .update(environments)
                .set({ authSubflowPath })
                .where(eq(environments.id, env.id));
            }
          } catch (subflowErr) {
            // Non-fatal: log and continue — crawl result is still valid
            app.log.warn({ err: subflowErr }, "Auth subflow generation failed");
          }

          // Save registry (entries are MobileSelectorEntry[] — same jsonb column)
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
          const message = err instanceof Error ? err.message : "Mobile crawl failed";
          app.log.error({ err }, "Mobile crawl failed");
          return reply.status(500).send({ error: message });
        }
      }

      // ── Web path ───────────────────────────────────────────────────────────

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

  // Capture a single screen the tester has manually navigated to on the device.
  // Merges into the latest registry: replaces entries tagged with the same screen,
  // keeps everything else, dedupes, and stores as a new registry snapshot.
  app.post<{ Body: { environmentId: string; screenName: string } }>(
    "/crawl-screen",
    async (req, reply) => {
      const { environmentId, screenName } = req.body;

      if (!environmentId || !screenName?.trim()) {
        return reply.status(400).send({ error: "environmentId and screenName are required" });
      }

      const [row] = await db
        .select({ env: environments, platform: projects.platform })
        .from(environments)
        .innerJoin(projects, eq(environments.projectId, projects.id))
        .where(eq(environments.id, environmentId));

      if (!row) return reply.status(404).send({ error: "Environment not found" });
      if (row.platform !== "android" && row.platform !== "ios") {
        return reply.status(400).send({ error: "Single-screen crawl is only available for mobile projects" });
      }

      try {
        const result = await crawlSingleScreen(screenName);

        // Load latest registry to merge into
        const [latest] = await db
          .select()
          .from(selectorRegistries)
          .where(eq(selectorRegistries.environmentId, environmentId))
          .orderBy(desc(selectorRegistries.crawledAt))
          .limit(1);

        const trimmedScreen = screenName.trim();
        const existing = (latest?.entries as MobileSelectorEntry[] | undefined) ?? [];

        // Drop entries from the same screen — they're stale for that screen now.
        const kept = existing.filter((e) => e.screen !== trimmedScreen);

        // Merge + dedupe across the full registry by (text, accessibilityId, resourceId).
        const merged: MobileSelectorEntry[] = [];
        const seen = new Set<string>();
        for (const e of [...kept, ...result.entries]) {
          const key = `${e.text ?? ""}|${e.accessibilityId ?? ""}|${e.resourceId ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(e);
        }

        const [registry] = await db
          .insert(selectorRegistries)
          .values({
            environmentId,
            entries: merged,
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
        const message = err instanceof Error ? err.message : "Single-screen crawl failed";
        app.log.error({ err }, "Single-screen crawl failed");
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
