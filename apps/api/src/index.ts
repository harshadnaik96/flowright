import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { projectRoutes } from "./routes/projects";
import { environmentRoutes } from "./routes/environments";
import { crawlerRoutes } from "./routes/crawler";
import { generatorRoutes } from "./routes/generator";
import { flowRoutes } from "./routes/flows";
import { runnerRoutes } from "./routes/runner";
import { agentTokenRoutes } from "./routes/agent-tokens";
import { downloadsRoutes } from "./routes/downloads";
import { agentRegistry } from "./services/agent-registry";

const app = Fastify({ logger: true });

async function bootstrap() {
  await app.register(cors, {
    origin: (origin, cb) => {
      const allowed = process.env.WEB_URL ?? "http://localhost:3000";
      // Allow exact match, any localhost port, or no origin (server-to-server / curl)
      if (!origin || origin === allowed || /^http:\/\/localhost:\d+$/.test(origin)) {
        cb(null, true);
      } else {
        cb(new Error("Not allowed by CORS"), false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  await app.register(websocket);

  // Health check
  app.get("/health", async () => ({ status: "ok", service: "flowright-api" }));

  // Routes
  await app.register(projectRoutes, { prefix: "/projects" });
  await app.register(environmentRoutes, { prefix: "/" });
  await app.register(crawlerRoutes, { prefix: "/crawler" });
  await app.register(generatorRoutes, { prefix: "/generator" });
  await app.register(flowRoutes, { prefix: "/flows" });
  await app.register(runnerRoutes, { prefix: "/runner" });
  await app.register(agentTokenRoutes, { prefix: "/agent-tokens" });
  await app.register(downloadsRoutes, { prefix: "/" });

  // Agent WebSocket endpoint — agents connect here with their token
  app.get("/agent/ws", { websocket: true }, async (socket, req) => {
    const token = (req.query as Record<string, string>).token;
    if (!token) {
      socket.close(1008, "token required");
      return;
    }
    const accepted = await agentRegistry.register(socket, token);
    if (!accepted) {
      socket.close(1008, "invalid token");
    }
  });

  const port = Number(process.env.PORT ?? 3001);
  // "::" listens on all IPv6 interfaces and, via dual-stack, also accepts
  // IPv4 connections — so both "localhost" (::1) and "127.0.0.1" work.
  const host = process.env.HOST ?? "::";

  await app.listen({ port, host });
  app.log.info(`Flowright API running on http://${host}:${port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
