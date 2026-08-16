import type { Context } from "npm:hono@4.12.27";
import * as jose from "npm:jose@5.9.3";
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
  const { data, error } = await adminClient.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(`Rate-limit unavailable: ${error.message}`);
  return data === true;
}

export function clientIp(c: Context): string {
  // Edge environment or reverse proxy
  const realIp = c.req.header("x-real-ip")?.trim();
  if (realIp && realIp.length > 0) return realIp;

  const cfConnecting = c.req.header("cf-connecting-ip")?.trim();
  if (cfConnecting && cfConnecting.length > 0) return cfConnecting;

  // x-forwarded-for format is usually: client, proxy1, proxy2
  // Supabase edge proxy might append, or overwrite. If it appends, 
  // taking the first element could allow spoofing if the user sent a fake header.
  // Using the right-most (last) proxy is safest against spoofing for rate limits,
  // OR the first element if the proxy overwrites. Usually Deno Deploy sets real IP.
  const forwarded = c.req.header("x-forwarded-for")?.split(",");
  if (forwarded && forwarded.length > 0) {
    return forwarded[forwarded.length - 1].trim();
  }
  return "unknown";
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

export async function requireAdmin(c: Context, capability?: string) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer "))
    throw new Error("Missing authorization");
  const token = authHeader.slice(7);

  // 1. Verify token signature
  const { data: authData, error: authErr } = await adminClient.auth.getUser(token);
  if (authErr || !authData.user) throw new Error("Invalid or expired session");

  // 2. Verify JWT signature & AAL securely using the JWT secret
  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (!jwtSecret) throw new Error("Missing SUPABASE_JWT_SECRET in environment");

  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(jwtSecret));
    
    if (payload.aal !== "aal2") {
      throw new Error("Admin actions require MFA (aal2)");
    }

    // Verify recent step-up (MFA within last 5 mins)
    if (!payload.amr || !Array.isArray(payload.amr)) {
      throw new Error("Admin actions require recent step-up authentication.");
    }

    const mfaClaim = payload.amr.find((x: any) => x.method === "totp" || x.method === "mfa");
    if (!mfaClaim || !mfaClaim.timestamp) {
      throw new Error("Admin actions require recent step-up authentication.");
    }

    const mfaAge = (Date.now() / 1000) - mfaClaim.timestamp;
    if (mfaAge > 300) { // 5 minutes
      throw new Error("Admin actions require recent step-up authentication. Please re-authenticate MFA.");
    }
  } catch (e) {
    if (e instanceof Error && (e.message.includes("MFA") || e.message.includes("step-up"))) {
      throw e;
    }
    console.warn("JWT verification failed for admin action", e);
    throw new Error("Invalid admin session or missing claims");
  }

  const userId = authData.user.id;

  // 3. Verify Role from DB (not from token)
  const { data, error } = await adminClient
    .from("profiles")
    .select("role, admin_capabilities")
    .eq("id", userId)
    .single();
  
  if (error || data?.role !== "admin") {
    throw new Error("Admin access denied");
  }

  if (capability && (!data.admin_capabilities || !data.admin_capabilities.includes(capability))) {
    throw new Error(`Admin capability missing: ${capability}`);
  }

  return authData.user;
}
