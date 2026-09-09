const express = require("express");
const { pool } = require("./db");
const { requireAuth, requireOwner } = require("./auth");
const { accessBlocked } = require("./plans");
const { sendEstimateEmail } = require("./mailer");
const { buildEstimateEmailHtml } = require("./emailTemplate");

const router = express.Router();

// Members only see what they created; the owner sees everything for the company.
router.get("/", requireAuth, async (req, res) => {
  try {
    const isOwner = req.auth.role === "owner";
    const query = isOwner
      ? "SELECT * FROM estimates WHERE company_id = $1 ORDER BY created_at DESC"
      : "SELECT * FROM estimates WHERE company_id = $1 AND created_by = $2 ORDER BY created_at DESC";
    const params = isOwner ? [req.auth.companyId] : [req.auth.companyId, req.auth.userId];
    const result = await pool.query(query, params);
    res.json({ estimates: result.rows });
  } catch (e) {
    console.error("List estimates error:", e);
    res.status(500).json({ error: "Failed to load estimates" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM estimates WHERE id = $1 AND company_id = $2", [req.params.id, req.auth.companyId]);
    const estimate = result.rows[0];
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });
    if (req.auth.role !== "owner" && estimate.created_by !== req.auth.userId) {
      return res.status(403).json({ error: "You can only view estimates you created" });
    }
    res.json({ estimate });
  } catch (e) {
    console.error("Get estimate error:", e);
    res.status(500).json({ error: "Failed to load estimate" });
  }
});

// Anyone on the team can create an estimate. If the OWNER creates it, it's
// auto-approved (they're the approver, no point routing it to themselves).
// If a MEMBER creates it, it lands as pending_approval for the owner.
router.post("/", requireAuth, async (req, res) => {
  const { customerName, customerAddress, customerEmail, color, notes, totals } = req.body || {};
  if (!customerName || !customerEmail || !totals) {
    return res.status(400).json({ error: "Missing customerName, customerEmail, or totals" });
  }

  try {
    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    if (accessBlocked(companyResult.rows[0])) {
      return res.status(402).json({ error: "Your free trial has ended. Choose a plan to keep creating estimates." });
    }

    const isOwner = req.auth.role === "owner";
    const status = isOwner ? "approved" : "pending_approval";

    const result = await pool.query(
      `INSERT INTO estimates (company_id, created_by, customer_name, customer_address, customer_email, color, notes, totals, status, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${isOwner ? "now()" : "NULL"})
       RETURNING *`,
      [
        req.auth.companyId,
        req.auth.userId,
        customerName,
        customerAddress || null,
        customerEmail,
        color || null,
        notes || null,
        JSON.stringify(totals),
        status,
        isOwner ? req.auth.userId : null,
      ]
    );
    res.json({ estimate: result.rows[0] });
  } catch (e) {
    console.error("Create estimate error:", e);
    res.status(500).json({ error: "Failed to create estimate" });
  }
});

// Owner approves a member's pending estimate. Doesn't send it yet — that's
// a separate step, so the owner can approve now and send later if they want.
router.post("/:id/approve", requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE estimates SET status = 'approved', approved_by = $1, approved_at = now()
       WHERE id = $2 AND company_id = $3 AND status = 'pending_approval'
       RETURNING *`,
      [req.auth.userId, req.params.id, req.auth.companyId]
    );
    if (!result.rows.length) return res.status(404).json({ error: "No pending estimate found with that id" });
    res.json({ estimate: result.rows[0] });
  } catch (e) {
    console.error("Approve estimate error:", e);
    res.status(500).json({ error: "Failed to approve estimate" });
  }
});

// Owner-only: actually emails the customer. Requires the estimate to already
// be approved (owner-created ones are auto-approved on creation, so this
// works immediately for those; member-created ones need /approve first).
router.post("/:id/send", requireAuth, requireOwner, async (req, res) => {
  try {
    const estimateResult = await pool.query("SELECT * FROM estimates WHERE id = $1 AND company_id = $2", [req.params.id, req.auth.companyId]);
    const estimate = estimateResult.rows[0];
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });
    if (estimate.status === "pending_approval") {
      return res.status(400).json({ error: "Approve this estimate before sending it" });
    }
    if (estimate.status === "sent") {
      return res.status(400).json({ error: "This estimate was already sent" });
    }

    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    const company = companyResult.rows[0];

    const html = buildEstimateEmailHtml(company, estimate);
    await sendEstimateEmail({
      toEmail: estimate.customer_email,
      toName: estimate.customer_name,
      replyToEmail: company.contact_email,
      replyToName: company.business_name,
      subject: `${company.business_name || "Your estimate"} — Estimate for ${estimate.customer_name}`,
      html,
    });

    const result = await pool.query("UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ estimate: result.rows[0] });
  } catch (e) {
    console.error("Send estimate error:", e);
    res.status(502).json({ error: e.message || "Failed to send estimate" });
  }
});

// Convenience endpoint for the common owner flow: approve + send in one click.
router.post("/:id/approve-and-send", requireAuth, requireOwner, async (req, res) => {
  try {
    await pool.query(
      `UPDATE estimates SET status = 'approved', approved_by = $1, approved_at = now()
       WHERE id = $2 AND company_id = $3 AND status = 'pending_approval'`,
      [req.auth.userId, req.params.id, req.auth.companyId]
    );

    const estimateResult = await pool.query("SELECT * FROM estimates WHERE id = $1 AND company_id = $2", [req.params.id, req.auth.companyId]);
    const estimate = estimateResult.rows[0];
    if (!estimate) return res.status(404).json({ error: "Estimate not found" });
    if (estimate.status === "sent") return res.status(400).json({ error: "This estimate was already sent" });

    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    const company = companyResult.rows[0];

    const html = buildEstimateEmailHtml(company, estimate);
    await sendEstimateEmail({
      toEmail: estimate.customer_email,
      toName: estimate.customer_name,
      replyToEmail: company.contact_email,
      replyToName: company.business_name,
      subject: `${company.business_name || "Your estimate"} — Estimate for ${estimate.customer_name}`,
      html,
    });

    const result = await pool.query("UPDATE estimates SET status = 'sent', sent_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
    res.json({ estimate: result.rows[0] });
  } catch (e) {
    console.error("Approve-and-send error:", e);
    res.status(502).json({ error: e.message || "Failed to approve and send" });
  }
});

module.exports = router;
