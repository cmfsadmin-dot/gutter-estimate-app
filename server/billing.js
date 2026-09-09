const express = require("express");
const Stripe = require("stripe");
const { pool } = require("./db");
const { requireAuth, requireOwner } = require("./auth");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_PRICE_PLAN_1999 = process.env.STRIPE_PRICE_PLAN_1999; // $19.99/mo price ID from your Stripe dashboard
const STRIPE_PRICE_PLAN_3999 = process.env.STRIPE_PRICE_PLAN_3999; // $39.99/mo price ID
const APP_URL = process.env.APP_URL || "http://localhost:5173";

if (!STRIPE_SECRET_KEY) {
  console.warn("\n⚠️  STRIPE_SECRET_KEY is not set. Billing routes won't work until server/.env has your Stripe keys.\n");
}

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY) : null;

const PRICE_BY_PLAN = {
  plan_1999: STRIPE_PRICE_PLAN_1999,
  plan_3999: STRIPE_PRICE_PLAN_3999,
};

const router = express.Router();

// Owner picks a plan -> we create a Stripe Checkout session -> frontend
// redirects the browser to session.url. Stripe handles card entry itself;
// we never touch card details.
router.post("/create-checkout-session", requireAuth, requireOwner, async (req, res) => {
  const { plan } = req.body || {};
  const priceId = PRICE_BY_PLAN[plan];
  if (!priceId) {
    return res.status(400).json({ error: "Unknown plan. Expected 'plan_1999' or 'plan_3999'." });
  }
  if (!stripe) {
    return res.status(500).json({ error: "Server is missing STRIPE_SECRET_KEY. See server/.env.example." });
  }

  try {
    const companyResult = await pool.query("SELECT * FROM companies WHERE id = $1", [req.auth.companyId]);
    const company = companyResult.rows[0];

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: company.contact_email || req.auth.email,
      client_reference_id: company.id,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/billing/cancelled`,
      metadata: { companyId: company.id, plan },
    });

    res.json({ url: session.url });
  } catch (e) {
    console.error("Checkout session error:", e);
    res.status(500).json({ error: "Failed to start checkout" });
  }
});

// Stripe calls this directly (not the frontend) when a subscription is
// created, updated, or cancelled. This is the ONLY place a company's plan
// should actually change after signup — never trust the frontend to set it.
// NOTE: this route needs the raw request body for signature verification,
// so it's mounted with express.raw() in index.js BEFORE the global
// express.json() middleware. Don't add app.use(express.json()) above it.
async function webhookHandler(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send("Webhook not configured");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    console.error("Webhook signature verification failed:", e.message);
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const companyId = session.metadata?.companyId;
      const plan = session.metadata?.plan;
      if (companyId && plan) {
        await pool.query("UPDATE companies SET plan = $1, stripe_customer_id = $2, stripe_subscription_id = $3 WHERE id = $4", [
          plan,
          session.customer,
          session.subscription,
          companyId,
        ]);
      }
    }

    if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      if (subscription.status === "canceled" || subscription.status === "unpaid") {
        await pool.query("UPDATE companies SET plan = 'trial', trial_ends_at = now() WHERE stripe_subscription_id = $1", [subscription.id]);
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error("Webhook handling error:", e);
    res.status(500).send("Webhook handler failed");
  }
}

module.exports = { router, webhookHandler };
