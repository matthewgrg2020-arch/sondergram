import { createServerFn } from "@tanstack/react-start";
import { requireUserId } from "@/lib/auth/verify.server";

const MAX_PART = 1_600_000;
const MAX_SNAPSHOT = 8_000_000;
const REPO = "matthewgrg2020-arch/sondergram";

function token() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "ghu_NpHF4MAExxWcQxNpFlgscy7fGeeNLX1IzywD";
}


type Index = { blobs: Array<{ id: string; parts: number }> };

function headers() {
  return { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "User-Agent": "sondergram" };
}

async function readFile(path: string): Promise<{ text: string; sha?: string } | null> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, { headers: headers() });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("Could not read the saved library.");
  const body = await response.json() as { content?: string; sha?: string };
  return { text: Buffer.from(body.content || "", "base64").toString(), sha: body.sha };
}

async function writeFile(path: string, text: string, sha?: string) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers: { ...headers(), "content-type": "application/json" },
    body: JSON.stringify({ message: "Save Sondergram library", content: Buffer.from(text).toString("base64"), sha }),
  });
  if (!response.ok) throw new Error("Could not save the library.");
}

function safe(id: string) {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export const cloudManifest = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireUserId();
  const snap = await readFile(`data/libraries/${safe(userId)}.json`);
  const index = await readFile(`data/libraries/${safe(userId)}.index.json`);
  const blobs = index ? (JSON.parse(index.text) as Index).blobs || [] : [];
  return { updatedAt: null, payload: snap?.text ?? null, blobs };
});

export const cloudSaveSnapshot = createServerFn({ method: "POST" })
  .validator((data: { payload: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    if (!data.payload || data.payload.length > MAX_SNAPSHOT) throw new Error("Library metadata is too large to save.");
    const path = `data/libraries/${safe(userId)}.json`;
    const current = await readFile(path);
    await writeFile(path, data.payload, current?.sha);
    return { ok: true as const };
  });

export const cloudPutPart = createServerFn({ method: "POST" })
  .validator((data: { trackId: string; part: number; payload: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    if (!data.trackId || data.part < 0 || data.part > 400) throw new Error("Bad audio part.");
    if (!data.payload || data.payload.length > MAX_PART) throw new Error("Audio part is too large.");
    const path = `data/libraries/${safe(userId)}-${safe(data.trackId)}-${data.part}.txt`;
    const current = await readFile(path);
    await writeFile(path, data.payload, current?.sha);
    const indexPath = `data/libraries/${safe(userId)}.index.json`;
    const indexFile = await readFile(indexPath);
    const index = indexFile ? (JSON.parse(indexFile.text) as Index) : { blobs: [] };
    const row = index.blobs.find((item) => item.id === data.trackId);
    if (row) row.parts = Math.max(row.parts, data.part + 1);
    else index.blobs.push({ id: data.trackId, parts: data.part + 1 });
    await writeFile(indexPath, JSON.stringify(index), indexFile?.sha);
    return { ok: true as const };
  });

export const cloudGetPart = createServerFn({ method: "POST" })
  .validator((data: { trackId: string; part: number }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const file = await readFile(`data/libraries/${safe(userId)}-${safe(data.trackId)}-${data.part}.txt`);
    return { payload: file?.text ?? null };
  });

export const cloudDropBlob = createServerFn({ method: "POST" })
  .validator((data: { trackId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const indexPath = `data/libraries/${safe(userId)}.index.json`;
    const indexFile = await readFile(indexPath);
    if (!indexFile) return { ok: true as const };
    const index = JSON.parse(indexFile.text) as Index;
    index.blobs = (index.blobs || []).filter((item) => item.id !== data.trackId);
    await writeFile(indexPath, JSON.stringify(index), indexFile.sha);
    return { ok: true as const };
  });
