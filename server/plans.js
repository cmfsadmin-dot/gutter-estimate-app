// Single source of truth for what each plan includes. If you change pricing
// or what's included, this is the only place that should need editing
// (billing.js reads price IDs from env, everything else reads limits from here).

const PLANS = {
  trial: {
    label: "Free trial",
    seatLimit: 10, // full access during trial so they can see everything before choosing a tier
    features: { branding: true, voice: true },
  },
  plan_1999: {
    label: "$19.99/mo",
    seatLimit: 3,
    features: { branding: true, voice: false },
  },
  plan_3999: {
    label: "$39.99/mo",
    seatLimit: 10,
    features: { branding: true, voice: true },
  },
};

function planInfo(planKey) {
  return PLANS[planKey] || PLANS.trial;
}

function trialExpired(company) {
  return company.plan === "trial" && new Date(company.trial_ends_at) < new Date();
}

// True once the trial has run out and no paid plan was ever chosen —
// used to block estimate/settings writes until they upgrade.
function accessBlocked(company) {
  return trialExpired(company);
}

module.exports = { PLANS, planInfo, trialExpired, accessBlocked };
