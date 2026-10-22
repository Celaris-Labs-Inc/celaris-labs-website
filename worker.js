const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX = { name: 120, email: 254, company: 160, role: 120, message: 4000 };

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function read(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function verifyTurnstile(env, token, ip) {
  const secret = env.TURNSTILE_SECRET;
  if (!secret) return "unconfigured";
  if (!token) return "missing";
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  if (!response.ok) return "invalid";
  const result = await response.json();
  return result.success ? "ok" : "invalid";
}

async function insertRow(env, table, row) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (response.ok || response.status === 201) return { ok: true };
  let detail = "";
  try {
    detail = await response.text();
  } catch {
    detail = "";
  }
  return { ok: false, status: response.status, detail };
}

function combinedMessage(company, role, message) {
  const bits = [];
  if (company) bits.push(`Company: ${company}`);
  if (role) bits.push(`Role: ${role}`);
  if (bits.length) return `${bits.join("\n")}\n\n${message}`;
  return message;
}

async function handlePartnerships(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return json({ ok: false, reason: "method" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "bad-request" }, 400);
  }

  if (read(body.website, 200) || read(body._honey, 200)) {
    return json({ ok: true });
  }

  const name = read(body.name, MAX.name);
  const email = read(body.email, MAX.email).toLowerCase();
  const company = read(body.company, MAX.company);
  const role = read(body.role, MAX.role);
  const message = read(body.message, MAX.message);
  const captchaToken = read(body.captchaToken, 2048);

  if (!name) return json({ ok: false, reason: "invalid-name" }, 400);
  if (!email || !EMAIL.test(email)) return json({ ok: false, reason: "invalid-email" }, 400);
  if (!message) return json({ ok: false, reason: "invalid-message" }, 400);

  const captcha = await verifyTurnstile(env, captchaToken, request.headers.get("CF-Connecting-IP"));
  if (captcha === "missing") return json({ ok: false, reason: "captcha-required" }, 400);
  if (captcha === "invalid" || captcha === "unconfigured") {
    return json({ ok: false, reason: "captcha-failed" }, 400);
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return json({ ok: false, reason: "not-configured" }, 503);
  }

  const inquiry = { name, email, company, role, message };
  const primary = await insertRow(env, "partnership_inquiries", inquiry);
  if (primary.ok) return json({ ok: true });

  const missingTable = primary.status === 404 || primary.detail.includes("PGRST205");
  if (missingTable) {
    const fallback = await insertRow(env, "contact_messages", {
      name,
      email,
      message: combinedMessage(company, role, message),
    });
    if (fallback.ok) return json({ ok: true });
  }

  return json({ ok: false, reason: "upstream" }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/partnerships") {
      return handlePartnerships(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
