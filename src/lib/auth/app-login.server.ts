import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";

const COOKIE = "sg_account";
const REPO = "matthewgrg2020-arch/sondergram";
const FILE = "data/accounts.json";

type Stored = { userId: string; email: string; passwordHash: string };

function token() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "ghu_NpHF4MAExxWcQxNpFlgscy7fGeeNLX1IzywD";
}

function secret() {
  return process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "sondergram-account-v1";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

export function accountCookie(account: { userId: string; email: string }) {
  const payload = Buffer.from(JSON.stringify(account)).toString("base64url");
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
}

export function clearAccountCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
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

async function loadAccounts(): Promise<{ rows: Stored[]; sha?: string }> {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "User-Agent": "sondergram" },
  });
  if (response.status === 404) return { rows: [] };
  if (!response.ok) throw new Error("Could not open the account store.");
  const body = await response.json() as { content?: string; sha?: string };
  const rows = JSON.parse(Buffer.from(body.content || "", "base64").toString() || "[]") as Stored[];
  return { rows, sha: body.sha };
}

async function saveAccounts(rows: Stored[], sha?: string) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token()}`, Accept: "application/vnd.github+json", "User-Agent": "sondergram", "content-type": "application/json" },
    body: JSON.stringify({
      message: "Update Sondergram accounts",
      content: Buffer.from(JSON.stringify(rows)).toString("base64"),
      sha,
    }),
  });
  if (!response.ok) throw new Error("Could not save the account.");
}

export async function signUpAccount(email: string, password: string) {
  const { rows, sha } = await loadAccounts();
  if (rows.some((row) => row.email === email)) throw new Error("That email already has an account. Sign in instead.");
  const account = { userId: `mail_${randomBytes(12).toString("hex")}`, email, passwordHash: hashPassword(password) };
  await saveAccounts([...rows, account], sha);
  return account;
}

export async function signInAccount(email: string, password: string) {
  const { rows } = await loadAccounts();
  const account = rows.find((row) => row.email === email);
  if (!account || !checkPassword(password, account.passwordHash)) throw new Error("Email or password is wrong.");
  return account;
}
