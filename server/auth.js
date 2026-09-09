const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

if (!JWT_SECRET) {
  console.warn("\n⚠️  JWT_SECRET is not set. Set a long random string in server/.env — logins won't work without it.\n");
}

function signToken(user) {
  return jwt.sign({ userId: user.id, companyId: user.company_id, role: user.role, email: user.email }, JWT_SECRET, {
    expiresIn: "30d",
  });
}

// Attaches req.auth = { userId, companyId, role, email } from the Bearer token.
// Every route below auth.js in index.js should be assumed to require this,
// except /api/auth/signup and /api/auth/login themselves.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not logged in" });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session expired or invalid — please log in again" });
  }
}

// Use after requireAuth on any route only the contractor/owner should reach
// (settings, pricing, branding, user management, approving/sending estimates).
function requireOwner(req, res, next) {
  if (req.auth?.role !== "owner") {
    return res.status(403).json({ error: "Only the account owner can do this" });
  }
  next();
}

const router = express.Router();

router.post("/signup", async (req, res) => {
  const { businessName, ownerName, email, password, phone } = req.body || {};
  if (!businessName || !ownerName || !email || !password) {
    return res.status(400).json({ error: "Missing businessName, ownerName, email, or password" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
    if (existing.rows.length) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "An account with that email already exists" });
    }

    const companyResult = await client.query(
      `INSERT INTO companies (business_name, phone, contact_email, trial_ends_at)
       VALUES ($1, $2, $3, now() + ($4 || ' days')::interval)
       RETURNING *`,
      [businessName, phone || null, email.toLowerCase(), String(TRIAL_DAYS)]
    );
    const company = companyResult.rows[0];

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (company_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, 'owner')
       RETURNING *`,
      [company.id, ownerName, email.toLowerCase(), passwordHash]
    );
    const user = userResult.rows[0];

    await client.query("COMMIT");

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: sanitizeCompany(company),
    });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Signup error:", e);
    res.status(500).json({ error: "Signup failed" });
  } finally {
    client.release();
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

  try {
    const userResult = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
    const user = userResult.rows[0];
    if (!user) return res.status(401).json({ error: "Incorrect email or password" });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Incorrect email or password" });

    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [user.company_id]);
    const company = companyResult.rows[0];

    const token = signToken(user);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      company: sanitizeCompany(company),
    });
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const userResult = await pool.query("SELECT id, name, email, role FROM users WHERE id = $1", [req.auth.userId]);
    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    if (!userResult.rows[0] || !companyResult.rows[0]) return res.status(404).json({ error: "Account not found" });
    res.json({ user: userResult.rows[0], company: sanitizeCompany(companyResult.rows[0]) });
  } catch (e) {
    console.error("Me error:", e);
    res.status(500).json({ error: "Failed to load account" });
  }
});

// Strips Stripe internals before sending company data to the frontend.
function sanitizeCompany(company) {
  if (!company) return null;
  const { stripe_customer_id, stripe_subscription_id, ...rest } = company;
  return rest;
}

module.exports = { router, requireAuth, requireOwner, sanitizeCompany };
