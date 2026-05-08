import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import WebSocket from "ws";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "flowright-runs";
const LOCAL_BASE = process.env.SCREENSHOT_DIR ?? "/tmp/flowright-runs";
const SIGNED_URL_TTL_SECONDS = Number(process.env.SUPABASE_SIGNED_URL_TTL ?? 3600);

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      // Node < 22 has no global WebSocket. supabase-js initializes a Realtime
      // client on construction even though we only use Storage — provide ws
      // here so it doesn't throw at import time.
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    });
  }
  return client;
}

export function isCloudStorageEnabled(): boolean {
  return getClient() !== null;
}

/**
 * Uploads a screenshot. Returns the relative object path "<runId>/<filename>"
 * — uniform for both Supabase and local FS so we can resolve it on demand.
 */
export async function uploadScreenshot(
  runId: string,
  filename: string,
  data: Buffer,
): Promise<string> {
  const supabase = getClient();
  const objectPath = `${runId}/${filename}`;

  if (supabase) {
    const { error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .upload(objectPath, data, {
        contentType: "image/png",
        upsert: true,
      });
    if (error) throw new Error(`Supabase upload failed: ${error.message}`);
    return objectPath;
  }

  // Local fallback
  const dir = join(LOCAL_BASE, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), data);
  return objectPath;
}

export type ResolvedScreenshot =
  | { kind: "redirect"; url: string }
  | { kind: "buffer"; data: Buffer };

/**
 * Resolves a stored screenshot path to either a short-lived signed URL
 * (when using Supabase) or a Buffer read from local disk.
 */
export async function resolveScreenshot(
  runId: string,
  filename: string,
): Promise<ResolvedScreenshot> {
  if (!/^step-\d+\.png$/.test(filename)) throw new Error("Invalid screenshot filename");
  const objectPath = `${runId}/${filename}`;
  const supabase = getClient();

  if (supabase) {
    const { data, error } = await supabase.storage
      .from(SUPABASE_BUCKET)
      .createSignedUrl(objectPath, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new Error(`Supabase signed URL failed: ${error?.message ?? "no URL returned"}`);
    }
    return { kind: "redirect", url: data.signedUrl };
  }

  const buf = await readFile(join(LOCAL_BASE, runId, filename));
  return { kind: "buffer", data: buf };
}
