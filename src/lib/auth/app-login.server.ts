import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";

const COOKIE = "sg_account";

function secret() {
  return process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "sondergram-account-v1";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function accountCookie(userId: string, email: string) {
  const payload = Buffer.from(JSON.stringify({ userId, email })).toString("base64url");
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
}

export function readAccountCookie(header?: string | null): { userId: string; email: string } | null {
  const raw = header ?? getCookie(COOKIE);
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { userId?: string; email?: string };
    if (!parsed.userId || !parsed.email) return null;
    return { userId: parsed.userId, email: parsed.email };
  } catch {
    return null;
  }
}

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  return next.length === prev.length && timingSafeEqual(next, prev);
}

export async function signUpAccount(email: string, password: string) {
  const sql = await getSql();
  const existing = await sql.query<{ email: string }>("select email from app_login where email = $1", [email]);
  if (existing.length) throw new Error("That email already has an account. Sign in instead.");
  const userId = `mail_${randomBytes(12).toString("hex")}`;
  await sql.query("insert into app_login (email, password_hash, user_id) values ($1, $2, $3)", [email, hashPassword(password), userId]);
  return { userId, email };
}

export async function signInAccount(email: string, password: string) {
  const sql = await getSql();
  const rows = await sql.query<{ email: string; password_hash: string; user_id: string }>(
    "select email, password_hash, user_id from app_login where email = $1",
    [email],
  );
  const row = rows[0];
  if (!row || !checkPassword(password, row.password_hash)) throw new Error("Email or password is wrong.");
  return { userId: row.user_id, email: row.email };
}
