import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getCookie } from "@tanstack/react-start/server";

const COOKIE = "sg_account";

function secret() {
  return process.env.BETTER_AUTH_SECRET || process.env.AUTH_SECRET || "sondergram-account-v1";
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

type Account = { userId: string; email: string; passwordHash: string };

function accountCookie(account: Account) {
  const payload = Buffer.from(JSON.stringify(account)).toString("base64url");
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
}

export function readAccountCookie(header?: string | null): Account | null {
  const raw = header ?? getCookie(COOKIE);
  if (!raw) return null;
  const [payload, mac] = raw.split(".");
  if (!payload || !mac) return null;
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<Account>;
    if (!parsed.userId || !parsed.email || !parsed.passwordHash) return null;
    return { userId: parsed.userId, email: parsed.email, passwordHash: parsed.passwordHash };
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

export function signUpAccount(email: string, password: string) {
  return {
    cookie: accountCookie({ userId: `mail_${randomBytes(12).toString("hex")}`, email, passwordHash: hashPassword(password) }),
    email,
  };
}

export function signInAccount(email: string, password: string, current: Account | null) {
  if (!current || current.email !== email || !checkPassword(password, current.passwordHash)) {
    throw new Error("Create the account on this device first, then sign in with the same email and password.");
  }
  return { cookie: accountCookie(current), email: current.email, userId: current.userId };
}
