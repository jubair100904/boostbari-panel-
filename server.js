const express = require("express");
const rateLimit = require("express-rate-limit");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));
app.use(express.static("public", { extensions: ["html"] }));

const API_URL = process.env.GETMYFOLLOW_API_URL || "https://my.getmyfollow.com/api/v2";
const API_KEY = process.env.GETMYFOLLOW_API_KEY || "";
const ADMIN_PASSWORD = process.env.PANEL_ADMIN_PASSWORD || "";

const apiLimiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });
app.use("/api", apiLimiter);

async function providerRequest(params) {
  if (!API_KEY) throw new Error("Server is missing GETMYFOLLOW_API_KEY");
  const body = new URLSearchParams({ key: API_KEY, ...params });
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  return response.json();
}
function adminOnly(req, res, next) {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: "Admin password is not configured on server." });
  const supplied = req.get("x-admin-password") || "";
  if (supplied.length !== ADMIN_PASSWORD.length ||
      !require("crypto").timingSafeEqual(Buffer.from(supplied), Buffer.from(ADMIN_PASSWORD))) {
    return res.status(401).json({ error: "অ্যাডমিন পাসওয়ার্ড সঠিক নয়।" });
  }
  next();
}
app.get("/api/health", (req,res) => res.json({ ok: true, providerConfigured: Boolean(API_KEY) }));

// Service list is public. Consider filtering categories before exposing it to customers.
app.get("/api/services", async (req,res) => {
  try {
    const data = await providerRequest({ action: "services" });
    if (!Array.isArray(data)) return res.status(502).json({ error: "Unexpected provider response" });
    res.set("Cache-Control", "public, max-age=60");
    res.json(data.map(s => ({
      service: Number(s.service), name: String(s.name || ""), category: String(s.category || ""),
      rate: String(s.rate || ""), min: String(s.min || ""), max: String(s.max || ""),
      refill: Boolean(s.refill)
    })));
  } catch (e) { res.status(502).json({ error: "সার্ভিস লোড হয়নি। API সেটিংস ও provider status যাচাই করুন।" }); }
});

// Admin-only endpoints: never expose provider balance or spendable order API publicly.
app.get("/api/balance", adminOnly, async (req,res) => {
  try { res.json(await providerRequest({ action: "balance" })); }
  catch(e) { res.status(502).json({ error: "ব্যালেন্স আনা যায়নি।" }); }
});
app.post("/api/order", adminOnly, async (req,res) => {
  const { service, link, quantity } = req.body || {};
  if (!Number.isInteger(Number(service)) || Number(service) < 1 ||
      typeof link !== "string" || !/^https:\/\/\S+/i.test(link) ||
      !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 100000) {
    return res.status(400).json({ error: "Service, HTTPS link এবং 1–100000 quantity দিন।" });
  }
  try {
    const result = await providerRequest({ action: "add", service: String(service), link, quantity: String(quantity) });
    res.json(result);
  } catch(e) { res.status(502).json({ error: "Provider-এ অর্ডার পাঠানো যায়নি।" }); }
});
const port = process.env.PORT || 3000;
app.listen(port, "0.0.0.0", () => console.log(`BoostBari listening on ${port}`));
