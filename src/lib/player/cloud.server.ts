import { createServerFn } from "@tanstack/react-start";
import { requireUserId } from "@/lib/auth/verify.server";
import { getSql } from "@/lib/db";

const MAX_PART = 1_600_000;
const MAX_SNAPSHOT = 8_000_000;

export const cloudManifest = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireUserId();
  const sql = await getSql();
  const snap = await sql.query<{ payload: string; updated_at: string }>(
    "select payload, updated_at from library_snapshot where user_id = $1",
    [userId],
  );
  const blobs = await sql.query<{ track_id: string; parts: number }>(
    "select track_id, count(*)::int as parts from library_blob where user_id = $1 group by track_id",
    [userId],
  );
  return {
    updatedAt: snap[0]?.updated_at ?? null,
    payload: snap[0]?.payload ?? null,
    blobs: blobs.map((row) => ({ id: row.track_id, parts: Number(row.parts) })),
  };
});

export const cloudSaveSnapshot = createServerFn({ method: "POST" })
  .validator((data: { payload: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    if (!data.payload || data.payload.length > MAX_SNAPSHOT) throw new Error("Library metadata is too large to save.");
    const sql = await getSql();
    await sql.query(
      `insert into library_snapshot (user_id, payload, updated_at)
       values ($1, $2, now())
       on conflict (user_id) do update set payload = excluded.payload, updated_at = now()`,
      [userId, data.payload],
    );
    return { ok: true as const };
  });

export const cloudPutPart = createServerFn({ method: "POST" })
  .validator((data: { trackId: string; part: number; payload: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    if (!data.trackId || data.part < 0 || data.part > 400) throw new Error("Bad audio part.");
    if (!data.payload || data.payload.length > MAX_PART) throw new Error("Audio part is too large.");
    const sql = await getSql();
    if (data.part === 0) {
      await sql.query("delete from library_blob where user_id = $1 and track_id = $2", [userId, data.trackId]);
    }
    await sql.query(
      `insert into library_blob (user_id, track_id, part, payload)
       values ($1, $2, $3, $4)
       on conflict (user_id, track_id, part) do update set payload = excluded.payload`,
      [userId, data.trackId, data.part, data.payload],
    );
    return { ok: true as const };
  });

export const cloudGetPart = createServerFn({ method: "POST" })
  .validator((data: { trackId: string; part: number }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const sql = await getSql();
    const rows = await sql.query<{ payload: string }>(
      "select payload from library_blob where user_id = $1 and track_id = $2 and part = $3",
      [userId, data.trackId, data.part],
    );
    return { payload: rows[0]?.payload ?? null };
  });

export const cloudDropBlob = createServerFn({ method: "POST" })
  .validator((data: { trackId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const sql = await getSql();
    await sql.query("delete from library_blob where user_id = $1 and track_id = $2", [userId, data.trackId]);
    return { ok: true as const };
  });
