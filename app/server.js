/**
 * Qboule storefront — a deliberately lightweight Express app for trying
 * Datadog APM and OpenTelemetry on Clever Cloud. Modeled on qboule.fr
 * ("Artisanal. Spherical. Yours.").
 *
 * Intentionally NOT instrumented to start with: deploy it bare, confirm no
 * traces show up in Datadog, then add ddtrace / OTel as a follow-up (see README).
 *
 * Clever Cloud starts Node apps via `npm start` and REQUIRES listening on
 * 0.0.0.0:8080.
 */
// Datadog APM — basic auto-instrumentation. Must load before any instrumented
// library (express, http). Reads DD_* env vars (DD_TRACE_AGENT_URL, DD_SERVICE…).
const tracer = require("dd-trace").init();

const express = require("express");

const app = express();
app.use(express.json());

// Structured stdout logger that injects the active span's trace/span IDs.
// Diagnostic: if these IDs are non-null in the logs, dd-trace IS creating spans
// (so any "no traces in Datadog" is purely an export/transport problem). If they
// are null, the tracer isn't instrumenting at all.
function log(msg, extra = {}) {
  const span = tracer.scope().active();
  const ctx = span && span.context();
  console.log(
    JSON.stringify({
      level: "info",
      msg,
      dd: {
        trace_id: ctx ? ctx.toTraceId() : null,
        span_id: ctx ? ctx.toSpanId() : null,
      },
      ...extra,
    })
  );
}

// Log every request with its trace-correlation IDs.
app.use((req, res, next) => {
  log("request", { method: req.method, path: req.path });
  next();
});

const PORT = process.env.PORT || 8080;
const HOST = "0.0.0.0";

// Public upstream so traces get a downstream HTTP span once instrumented.
const UPSTREAM_URL = process.env.UPSTREAM_URL || "https://api.github.com/zen";

const QBOULES = [
  { id: "classic", name: "The Original Qboule", material: "hand-poured resin", price: 49 },
  { id: "noir", name: "Qboule Noir", material: "obsidian finish", price: 89 },
  { id: "lumen", name: "Qboule Lumen", material: "frosted glass, glows", price: 129 },
];

app.get("/", (req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Qboule</title>
<style>body{font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0;background:#0b0b0f;color:#f5f5f7;text-align:center}
.b{font-size:5rem}a{display:inline-block;margin-top:1rem;padding:.7rem 1.4rem;background:#f5f5f7;color:#0b0b0f;border-radius:999px;text-decoration:none;font-weight:600}</style>
</head><body><div>
<div class="b">&#127921;</div>
<h1>Qboule &mdash; The Original</h1>
<p>Artisanal. Spherical. Yours.</p>
<a href="/api/qboules">Browse the collection</a>
</div></body></html>`);
});

app.get("/api/qboules", async (req, res) => {
  // a touch of work + a downstream call -> good span material later
  const inventoryChecksum = QBOULES.reduce((acc, q) => acc + q.price, 0);
  const upstream = await callUpstream();
  res.json({ qboules: QBOULES, inventoryChecksum, upstream });
});

app.get("/api/qboules/:id", (req, res) => {
  const q = QBOULES.find((x) => x.id === req.params.id);
  if (!q) return res.status(404).json({ error: "no such qboule" });
  res.json(q);
});

app.post("/api/checkout", async (req, res) => {
  const { id, quantity = 1 } = req.body || {};
  const q = QBOULES.find((x) => x.id === id);
  if (!q) return res.status(400).json({ error: "unknown qboule id" });
  const receipt = await processOrder(q, quantity); // nested calls -> span nesting
  res.json(receipt);
});

app.get("/slow", async (req, res) => {
  const seconds = Number(req.query.seconds) || 0.3 + Math.random() * 1.2;
  await sleep(seconds * 1000);
  res.json({ slept: Number(seconds.toFixed(3)) });
});

app.get("/error", () => {
  throw new Error("intentional error for APM/OTel error testing");
});

// --- helpers (nested to demonstrate span nesting once instrumented) ---
async function processOrder(qboule, quantity) {
  await sleep(50);
  const payment = await chargePayment(qboule.price * quantity);
  return { item: qboule.id, quantity, total: qboule.price * quantity, payment };
}

async function chargePayment(amount) {
  await sleep(50);
  const upstream = await callUpstream();
  return { amount, status: upstream.error ? "deferred" : "captured" };
}

async function callUpstream() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const resp = await fetch(UPSTREAM_URL, { signal: ctrl.signal });
    return { statusCode: resp.status };
  } catch (err) {
    console.warn("upstream call failed:", err.message);
    return { error: err.message };
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON error handler so /error (and any thrown error) returns a clean 500.
app.use((err, req, res, next) => {
  log("unhandled_error", { error: err.message });
  res.status(500).json({ error: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`qboule listening on http://${HOST}:${PORT}`);
});
