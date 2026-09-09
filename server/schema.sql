-- Run this once against your Postgres database to set up tables.
-- psql "$DATABASE_URL" -f schema.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT NOT NULL,
  phone TEXT,
  license TEXT,
  contact_email TEXT, -- shown on estimates / used as reply-to when sending
  logo_data_url TEXT,
  brand_accent TEXT,
  brand_dark TEXT,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb, -- gutter/downspout/elbow/accessory rate grids, guard price, min job
  incentive_enabled BOOLEAN NOT NULL DEFAULT true,
  incentive_text TEXT,
  incentive_value NUMERIC,
  plan TEXT NOT NULL DEFAULT 'trial', -- 'trial' | 'plan_1999' | 'plan_3999'
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '14 days'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'member'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id),
  customer_name TEXT NOT NULL,
  customer_address TEXT,
  customer_email TEXT NOT NULL,
  color TEXT,
  notes TEXT,
  totals JSONB NOT NULL, -- line items + total, as built by the client
  status TEXT NOT NULL DEFAULT 'pending_approval', -- 'pending_approval' | 'approved' | 'sent'
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_company ON estimates(company_id);
CREATE INDEX IF NOT EXISTS idx_estimates_created_by ON estimates(created_by);
CREATE INDEX IF NOT EXISTS idx_estimates_status ON estimates(status);
