const express = require("express");
const { pool } = require("./db");
const { requireAuth } = require("./auth");
const { planInfo, accessBlocked } = require("./plans");

const router = express.Router();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

if (!ANTHROPIC_API_KEY) {
  console.warn(
    "\n⚠️  ANTHROPIC_API_KEY is not set. Copy server/.env.example to server/.env and add your key from https://console.anthropic.com/settings/keys\n"
  );
}

function buildPrompt(transcript) {
  return `Extract gutter job measurements from this contractor's spoken/typed description. Respond with ONLY strict JSON, no markdown fences, no commentary. Use exactly this shape, OMITTING any story/size key that was not mentioned (do not invent zeros):
{
  "color": "string or omit if not mentioned",
  "gutter": { "1st": {"5in": number, "6in": number}, "2nd": {"5in": number, "6in": number}, "3rd": {"5in": number, "6in": number} },
  "downspouts": { "1st": {"2x3": number, "3x4": number, "4x5": number}, "2nd": {"2x3": number, "3x4": number, "4x5": number}, "3rd": {"2x3": number, "3x4": number, "4x5": number} },
  "guardLengthFt": number
}
Only include stories/sizes/fields actually stated. Transcript: """${transcript}"""`;
}

router.post("/parse-transcript", requireAuth, async (req, res) => {
  const { transcript } = req.body || {};
  if (!transcript || !transcript.trim()) {
    return res.status(400).json({ error: "Missing transcript" });
  }
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "Server is missing ANTHROPIC_API_KEY. See server/.env.example." });
  }

  try {
    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    const company = companyResult.rows[0];
    if (accessBlocked(company)) {
      return res.status(402).json({ error: "Your free trial has ended. Choose a plan to keep using voice entry." });
    }
    if (!planInfo(company.plan).features.voice) {
      return res.status(403).json({ error: "Voice entry isn't included on your current plan. Upgrade to $39.99/mo to unlock it." });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1000,
        messages: [{ role: "user", content: buildPrompt(transcript) }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "Anthropic API request failed" });
    }

    const data = await response.json();
    const text = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(502).json({ error: "Model did not return valid JSON" });
    }
    res.json(parsed);
  } catch (e) {
    console.error("Voice parse error:", e);
    res.status(500).json({ error: "Unexpected server error" });
  }
});

module.exports = router;
