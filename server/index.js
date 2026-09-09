require("dotenv").config();
const express = require("express");
const cors = require("cors");

const { router: authRouter } = require("./auth");
const usersRouter = require("./users");
const companyRouter = require("./company");
const estimatesRouter = require("./estimates");
const voiceRouter = require("./voice");
const { router: billingRouter, webhookHandler } = require("./billing");

const app = express();
app.use(cors());

// IMPORTANT: the Stripe webhook needs the raw request body to verify its
// signature, so it's mounted here — BEFORE express.json() below — with its
// own raw-body parser. If you move this after express.json(), signature
// verification will fail on every webhook call.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), webhookHandler);

app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/company", companyRouter);
app.use("/api/estimates", estimatesRouter);
app.use("/api", voiceRouter); // exposes POST /api/parse-transcript
app.use("/api/billing", billingRouter); // exposes POST /api/billing/create-checkout-session

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Gutter estimate server running on http://localhost:${PORT}`));
