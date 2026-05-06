import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "flowright-runs";
const LOCAL_BASE = process.env.SCREENSHOT_DIR ?? "/tmp/flowright-runs";

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export function isCloudStorageEnabled(): boolean {
  return getClient() !== null;
}

/**
 * Uploads a screenshot. Returns the value to store in stepResults.screenshotPath:
 *  - If Supabase configured: full public URL
 *  - Otherwise: relative path "<runId>/<filename>" served by /runner/screenshots
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

    const { data: pub } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(objectPath);
    return pub.publicUrl;
  }

  // Local fallback
  const dir = join(LOCAL_BASE, runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), data);
  return objectPath;
}
