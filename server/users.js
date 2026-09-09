const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("./db");
const { requireAuth, requireOwner } = require("./auth");
const { planInfo } = require("./plans");

const router = express.Router();

// List teammates — owner only. Members don't need to see this.
router.get("/", requireAuth, requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, email, role, created_at FROM users WHERE company_id = $1 ORDER BY created_at ASC",
      [req.auth.companyId]
    );
    res.json({ users: result.rows });
  } catch (e) {
    console.error("List users error:", e);
    res.status(500).json({ error: "Failed to load team" });
  }
});

// Add a team member — owner only. They get a role of 'member': estimating
// tool only, no settings access, and estimates they create need the
// owner's approval before sending. Owner sets their initial password
// directly (no invite-email flow yet — the member should change it after
// first login if you want that later).
router.post("/", requireAuth, requireOwner, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Missing name, email, or password" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  try {
    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    const company = companyResult.rows[0];
    const limit = planInfo(company.plan).seatLimit;

    const countResult = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE company_id = $1", [req.auth.companyId]);
    if (countResult.rows[0].count >= limit) {
      return res.status(403).json({ error: `Your plan (${planInfo(company.plan).label}) allows up to ${limit} users. Upgrade to add more.` });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: "That email is already in use" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'member')
       RETURNING id, name, email, role, created_at`,
      [req.auth.companyId, name, email.toLowerCase(), passwordHash]
    );
    res.json({ user: result.rows[0] });
  } catch (e) {
    console.error("Add user error:", e);
    res.status(500).json({ error: "Failed to add team member" });
  }
});

// Remove a team member — owner only. Can't remove yourself this way.
router.delete("/:id", requireAuth, requireOwner, async (req, res) => {
  if (req.params.id === req.auth.userId) {
    return res.status(400).json({ error: "You can't remove your own owner account" });
  }
  try {
    const result = await pool.query("DELETE FROM users WHERE id = $1 AND company_id = $2 AND role = 'member' RETURNING id", [
      req.params.id,
      req.auth.companyId,
    ]);
    if (!result.rows.length) return res.status(404).json({ error: "Team member not found" });
    res.json({ ok: true });
  } catch (e) {
    console.error("Remove user error:", e);
    res.status(500).json({ error: "Failed to remove team member" });
  }
});

module.exports = router;
