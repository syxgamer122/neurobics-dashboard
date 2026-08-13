import type { Context } from "npm:hono@4.12.27";
import { adminClient } from "./config.ts";

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await adminClient.rpc("check_signup_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`Rate-limit unavailable: ${error.message}`);
  return data === true;
}

export function clientIp(c: Context): string {
  // CHI tin x-forwarded-for: header nay do chinh ha tang Supabase/Deno gan vao.
  //
  // Truoc day `cf-connecting-ip` va `x-real-ip` duoc uu tien TRUOC. Edge
  // Function cua Supabase khong dung sau Cloudflare nen khong co gi ghi de hai
  // header do => client tu dat duoc. Ke tan cong chi can doi header moi request
  // la moi lan ra mot hash IP khac nhau, vo hieu hoan toan gioi han 10 lan/15
  // phut cua rate-limit dang ky.
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length > 0 ? forwarded : "unknown";
}

type TurnstileVerdict = { ok: boolean; codes: string[] };

export async function verifyTurnstile(
  token: string,
  ip: string,
): Promise<TurnstileVerdict> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) throw new Error("TURNSTILE_SECRET_KEY is not configured.");

  const body = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") body.set("remoteip", ip);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
    },
  );
  if (!response.ok)
    throw new Error(`Turnstile Siteverify returned HTTP ${response.status}.`);

  const result = (await response.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };
  const codes = result["error-codes"] ?? [];
  if (!result.success)
    console.log(`Turnstile rejected signup: ${codes.join(", ") || "no code"}`);
  return { ok: result.success === true, codes };
}

// Doi ma loi kho hieu cua Cloudflare thanh cau nguoi thuong doc duoc.
export function turnstileMessage(codes: string[]): string {
  if (
    codes.includes("missing-input-secret") ||
    codes.includes("invalid-input-secret")
  )
    return "Human verification is misconfigured on the server. Please contact the admin.";
  if (codes.includes("timeout-or-duplicate"))
    return "Human verification expired. Please tick the box again and resubmit.";
  if (
    codes.includes("invalid-input-response") ||
    codes.includes("missing-input-response")
  )
    return "Human verification token is invalid. Please tick the box again.";
  return "Human verification failed or expired. Please try again.";
}

// ─── Secure round lifecycle ──────────────────────────────────────────────────
export async function authenticatedUser(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    throw new Error("Missing authorization");
  const token = authHeader.slice(7);
  const { data, error } = await adminClient.auth.getUser(token);
  if (error || !data.user) throw new Error("Invalid or expired session");
  return data.user;
}

export async function requireAdmin(userId: string) {
  const { data, error } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  if (error || data?.role !== "admin") throw new Error("Admin access denied");
}
