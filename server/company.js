const express = require("express");
const { pool } = require("./db");
const { requireAuth, requireOwner, sanitizeCompany } = require("./auth");
const { planInfo, accessBlocked } = require("./plans");

const router = express.Router();

// Any team member can read settings (they need pricing to build estimates)
// but only the owner can change them.
router.get("/", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    if (!result.rows[0]) return res.status(404).json({ error: "Company not found" });
    const company = sanitizeCompany(result.rows[0]);
    res.json({ company, plan: planInfo(company.plan), accessBlocked: accessBlocked(company) });
  } catch (e) {
    console.error("Get company error:", e);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/", requireAuth, requireOwner, async (req, res) => {
  const { businessName, phone, license, contactEmail, logoDataUrl, brandAccent, brandDark, pricing, incentiveEnabled, incentiveText, incentiveValue } =
    req.body || {};

  try {
    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    const company = companyResult.rows[0];
    if (accessBlocked(company)) {
      return res.status(402).json({ error: "Your free trial has ended. Choose a plan to keep editing settings." });
    }
    if ((logoDataUrl || brandAccent) && !planInfo(company.plan).features.branding) {
      return res.status(403).json({ error: "Custom branding isn't included on your current plan. Upgrade to use it." });
    }

    const result = await pool.query(
      `UPDATE companies SET
        business_name = $1, phone = $2, license = $3, contact_email = $4,
        logo_data_url = $5, brand_accent = $6, brand_dark = $7,
        pricing = $8, incentive_enabled = $9, incentive_text = $10, incentive_value = $11
       WHERE id = $12
       RETURNING *`,
      [
        businessName,
        phone || null,
        license || null,
        contactEmail || null,
        logoDataUrl || null,
        brandAccent || null,
        brandDark || null,
        JSON.stringify(pricing || {}),
        incentiveEnabled !== false,
        incentiveText || null,
        incentiveValue || null,
        req.auth.companyId,
      ]
    );
    res.json({ company: sanitizeCompany(result.rows[0]) });
  } catch (e) {
    console.error("Update company error:", e);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

module.exports = router;
