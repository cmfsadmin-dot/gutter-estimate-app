import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Settings, FileText, Ruler, Check, Send, ChevronRight, Building2, Loader2, Mic, MicOff,
  Sparkles, Upload, Users, LogOut, ChevronDown, ChevronUp, ThumbsUp, Clock, Crown,
} from "lucide-react";

// ---------- design tokens ----------
const COLORS = {
  slate: "#1C2B39", slateDeep: "#101B24", paper: "#F6F4EF", paperLine: "#E4DFD3",
  ink: "#1F2530", steel: "#5B6B7A", orange: "#E15A2B", green: "#3F7D5C",
};
const FONT_DISPLAY = "'Barlow Condensed', system-ui, sans-serif";
const FONT_BODY = "'Inter', system-ui, sans-serif";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const TOKEN_KEY = "gutter-app:token";

const STORIES = ["1st", "2nd", "3rd"];
const GUTTER_SIZES = ["5in", "6in"];
const GUTTER_SIZE_LABEL = { "5in": '5"', "6in": '6"' };
const DOWNSPOUT_SIZES = ["2x3", "3x4", "4x5"];
const DOWNSPOUT_SIZE_LABEL = { "2x3": "2x3", "3x4": "3x4", "4x5": "4x5" };
const ELBOW_TYPES = ["A", "B", "2in-offset", "4in-offset"];
const ELBOW_TYPE_LABEL = { A: "A elbow", B: "B elbow", "2in-offset": '2" Offset', "4in-offset": '4" Offset' };
const ACCESSORY_GUTTER_TYPES = ["end-cap-r", "end-cap-l", "outside-miter", "inside-miter", "outside-bay-miter", "inside-bay-miter"];
const ACCESSORY_GUTTER_LABEL = {
  "end-cap-r": "End Cap R", "end-cap-l": "End Cap L", "outside-miter": "Outside Miter",
  "inside-miter": "Inside Miter", "outside-bay-miter": "Outside Bay Miter", "inside-bay-miter": "Inside Bay Miter",
};
const PIPEBAND_ROW = ["pipeband"];
const PIPEBAND_LABEL = { pipeband: "Pipeband" };

const STATUS_LABEL = { pending_approval: "Pending approval", approved: "Approved", sent: "Sent" };
const STATUS_COLOR = { pending_approval: COLORS.orange, approved: COLORS.slate, sent: COLORS.green };

function emptyGrid(rowKeys, colKeys, fill) {
  const grid = {};
  rowKeys.forEach((r) => { grid[r] = {}; colKeys.forEach((c) => (grid[r][c] = fill(r, c))); });
  return grid;
}
function emptyCountGrid(rowKeys, colKeys) { return emptyGrid(rowKeys, colKeys, () => ""); }

function currency(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function darkenHex(hex, amt) {
  const n = (hex || "#1C2B39").replace("#", "");
  const r = parseInt(n.substring(0, 2), 16) || 0, g = parseInt(n.substring(2, 4), 16) || 0, b = parseInt(n.substring(4, 6), 16) || 0;
  const dr = Math.round(r * (1 - amt)), dg = Math.round(g * (1 - amt)), db = Math.round(b * (1 - amt));
  return "#" + [dr, dg, db].map((v) => v.toString(16).padStart(2, "0")).join("");
}

function extractAccentColor(dataUrl) {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const size = 48;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) {
            const rr = data[i], gg = data[i + 1], bb = data[i + 2], aa = data[i + 3];
            if (aa < 100) continue;
            const brightness = (rr + gg + bb) / 3;
            if (brightness > 235 || brightness < 20) continue;
            r += rr; g += gg; b += bb; count++;
          }
          if (count === 0) return resolve(null);
          r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
          resolve("#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""));
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    } catch (e) { resolve(null); }
  });
}

const DEFAULT_PRICING = {
  gutterRates: emptyGrid(STORIES, GUTTER_SIZES, (story, size) => {
    const base = size === "5in" ? 17 : 19;
    const upcharge = story === "1st" ? 0 : story === "2nd" ? 4 : 8;
    return String(base + upcharge);
  }),
  downspoutStandardFt: { "1st": "15", "2nd": "25", "3rd": "35" },
  downspoutRates: emptyGrid(STORIES, DOWNSPOUT_SIZES, (story, size) => {
    const base = { "2x3": 7, "3x4": 8, "4x5": 9 }[size];
    const upcharge = story === "1st" ? 0 : story === "2nd" ? 2 : 4;
    return String(base + upcharge);
  }),
  elbowRates: emptyGrid(ELBOW_TYPES, DOWNSPOUT_SIZES, (type) => String({ A: 8, B: 8, "2in-offset": 10, "4in-offset": 12 }[type])),
  accessoryGutterRates: emptyGrid(ACCESSORY_GUTTER_TYPES, GUTTER_SIZES, (type) =>
    String({ "end-cap-r": 6, "end-cap-l": 6, "outside-miter": 14, "inside-miter": 14, "outside-bay-miter": 18, "inside-bay-miter": 18 }[type])
  ),
  pipebandRates: emptyGrid(PIPEBAND_ROW, DOWNSPOUT_SIZES, () => "4"),
  guardPricePerFt: "10.80",
  minJob: "350",
  incentiveText: "Complimentary 12-month gutter cleaning subscription included at no charge — booking incentive.",
  incentiveValue: "639",
};

// Maps the API's snake_case company row + JSONB pricing into the flat
// camelCase shape the settings form / estimate calculator use.
function companyToSettingsForm(company) {
  const pricing = company?.pricing || {};
  return {
    businessName: company?.business_name || "",
    phone: company?.phone || "",
    license: company?.license || "",
    email: company?.contact_email || "",
    logoDataUrl: company?.logo_data_url || null,
    brandAccent: company?.brand_accent || null,
    brandDark: company?.brand_dark || null,
    gutterRates: { ...DEFAULT_PRICING.gutterRates, ...(pricing.gutterRates || {}) },
    downspoutStandardFt: { ...DEFAULT_PRICING.downspoutStandardFt, ...(pricing.downspoutStandardFt || {}) },
    downspoutRates: { ...DEFAULT_PRICING.downspoutRates, ...(pricing.downspoutRates || {}) },
    elbowRates: { ...DEFAULT_PRICING.elbowRates, ...(pricing.elbowRates || {}) },
    accessoryGutterRates: { ...DEFAULT_PRICING.accessoryGutterRates, ...(pricing.accessoryGutterRates || {}) },
    pipebandRates: { ...DEFAULT_PRICING.pipebandRates, ...(pricing.pipebandRates || {}) },
    guardPricePerFt: pricing.guardPricePerFt ?? DEFAULT_PRICING.guardPricePerFt,
    minJob: pricing.minJob ?? DEFAULT_PRICING.minJob,
    incentiveEnabled: company?.incentive_enabled !== false,
    incentiveText: company?.incentive_text || DEFAULT_PRICING.incentiveText,
    incentiveValue: company?.incentive_value ?? DEFAULT_PRICING.incentiveValue,
  };
}

function settingsFormToApiPayload(form) {
  return {
    businessName: form.businessName,
    phone: form.phone,
    license: form.license,
    contactEmail: form.email,
    logoDataUrl: form.logoDataUrl,
    brandAccent: form.brandAccent,
    brandDark: form.brandDark,
    pricing: {
      gutterRates: form.gutterRates,
      downspoutStandardFt: form.downspoutStandardFt,
      downspoutRates: form.downspoutRates,
      elbowRates: form.elbowRates,
      accessoryGutterRates: form.accessoryGutterRates,
      pipebandRates: form.pipebandRates,
      guardPricePerFt: form.guardPricePerFt,
      minJob: form.minJob,
    },
    incentiveEnabled: form.incentiveEnabled,
    incentiveText: form.incentiveText,
    incentiveValue: form.incentiveValue,
  };
}

// ---------- API ----------
async function apiFetch(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// ---------- auth ----------
function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [plan, setPlan] = useState(null);
  const [accessBlocked, setAccessBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadCompany = useCallback(async (tok) => {
    const data = await apiFetch("/api/company", { token: tok });
    setCompany(data.company);
    setPlan(data.plan);
    setAccessBlocked(data.accessBlocked);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      if (!token) { setLoading(false); return; }
      try {
        const me = await apiFetch("/api/auth/me", { token });
        setUser(me.user);
        setCompany(me.company);
        await loadCompany(token);
      } catch (e) {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setCompany(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line

  const afterAuth = async (data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    setToken(data.token);
    setUser(data.user);
    setCompany(data.company);
    await loadCompany(data.token);
  };

  const login = async (email, password) => afterAuth(await apiFetch("/api/auth/login", { method: "POST", body: { email, password } }));
  const signup = async (form) => afterAuth(await apiFetch("/api/auth/signup", { method: "POST", body: form }));
  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null); setUser(null); setCompany(null); setPlan(null);
  };
  const refreshCompany = useCallback(() => (token ? loadCompany(token) : Promise.resolve()), [token, loadCompany]);

  return { token, user, company, plan, accessBlocked, loading, login, signup, logout, refreshCompany };
}

// ---------- shared UI ----------
function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block", marginBottom: 18 }}>
      <span style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.ink, display: "block", marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ fontFamily: FONT_BODY, fontSize: 12, color: COLORS.steel, display: "block", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", fontFamily: FONT_BODY, fontSize: 15, padding: "10px 12px",
  borderRadius: 4, border: `1px solid ${COLORS.paperLine}`, background: "#fff", color: COLORS.ink, outline: "none",
};
function TextInput(props) { return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />; }

function Button({ children, onClick, variant = "primary", style, disabled, type = "button" }) {
  const base = {
    fontFamily: FONT_BODY, fontSize: 14, fontWeight: 600, padding: "11px 18px", borderRadius: 4, border: "none",
    cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, opacity: disabled ? 0.55 : 1,
  };
  const variants = {
    primary: { background: COLORS.orange, color: "#fff" },
    dark: { background: COLORS.slate, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.slate, border: `1px solid ${COLORS.paperLine}` },
  };
  return <button type={type} onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function SectionHeading({ eyebrow, title, hint }) {
  return (
    <div style={{ margin: "28px 0 16px", paddingTop: 20, borderTop: `1px solid ${COLORS.paperLine}` }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: COLORS.slate, letterSpacing: 0.2 }}>{title}</div>
      {hint && <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: COLORS.steel, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

function BlockHeading({ title, hint, included, onToggle }) {
  return (
    <div style={{ margin: "28px 0 14px", paddingTop: 20, borderTop: `1px solid ${COLORS.paperLine}`, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
      <div>
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: COLORS.slate, letterSpacing: 0.2 }}>{title}</div>
        {hint && <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: COLORS.steel, marginTop: 2 }}>{hint}</div>}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: included ? COLORS.green : COLORS.steel, cursor: "pointer" }}>
        <input type="checkbox" checked={included} onChange={(e) => onToggle(e.target.checked)} />
        {included ? "Included on this estimate" : "Removed from this estimate"}
      </label>
    </div>
  );
}

function EmptyState({ icon, title, body }) {
  return (
    <div style={{ border: `1px dashed ${COLORS.paperLine}`, borderRadius: 6, padding: "40px 28px", maxWidth: 480 }}>
      <div style={{ color: COLORS.orange, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 24, color: COLORS.slate, marginBottom: 6 }}>{title}</div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 14, color: COLORS.steel, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}

function Grid({ rowKeys, rowLabels, colKeys, colLabels, grid, onChange, unit, min = "0", rowHeader = "" }) {
  return (
    <div style={{ overflowX: "auto", marginBottom: 8 }}>
      <table style={{ borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: 13, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "0 10px 8px 0", color: COLORS.steel, fontWeight: 600, fontSize: 12 }}>{rowHeader}</th>
            {colKeys.map((c) => (
              <th key={c} style={{ textAlign: "left", padding: "0 10px 8px", color: COLORS.steel, fontWeight: 600, fontSize: 12 }}>{(colLabels && colLabels[c]) || c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowKeys.map((row) => (
            <tr key={row}>
              <td style={{ padding: "6px 10px 6px 0", fontWeight: 600, color: COLORS.ink, whiteSpace: "nowrap" }}>{(rowLabels && rowLabels[row]) || row}</td>
              {colKeys.map((c) => (
                <td key={c} style={{ padding: "6px 10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {unit === "$" && <span style={{ color: COLORS.steel }}>$</span>}
                    <TextInput type="number" min={min} step={unit === "ea" ? "1" : "0.01"} value={grid[row]?.[c] ?? ""} onChange={(e) => onChange(row, c, e.target.value)} style={{ width: 76, padding: "7px 8px" }} />
                    {unit === "ft" && <span style={{ color: COLORS.steel, fontSize: 12 }}>ft</span>}
                    {unit === "ea" && <span style={{ color: COLORS.steel, fontSize: 12 }}>ea</span>}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineRow({ label, amount }) {
  return (
    <tr style={{ borderBottom: `1px solid ${COLORS.paperLine}` }}>
      <td style={{ padding: "8px 0", color: COLORS.ink }}>{label}</td>
      <td style={{ padding: "8px 0", textAlign: "right", color: COLORS.ink, fontVariantNumeric: "tabular-nums" }}>{currency(amount)}</td>
    </tr>
  );
}

function estimateLines(totals) {
  return [
    ...(totals.gutterLines || []),
    ...(totals.downspoutLines || []),
    ...(totals.elbowLines || []),
    ...(totals.accessoryLines || []),
    ...(totals.guardCost > 0 ? [{ label: `${totals.guardLen} ft. gutter guard`, amount: totals.guardCost }] : []),
  ];
}

// ---------- Auth screen (login / signup) ----------
function AuthScreen({ auth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ businessName: "", ownerName: "", email: "", password: "", phone: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      if (mode === "login") await auth.login(form.email, form.password);
      else await auth.signup(form);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, padding: 20 }}>
      <div style={{ background: "#fff", border: `1px solid ${COLORS.paperLine}`, borderRadius: 8, padding: 32, width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
          <div style={{ width: 32, height: 32, borderRadius: 4, background: COLORS.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 size={18} color="#fff" />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: COLORS.slate, fontWeight: 600 }}>Gutter Estimate Builder</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setMode("login")} style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: `1px solid ${COLORS.paperLine}`, background: mode === "login" ? COLORS.slate : "#fff", color: mode === "login" ? "#fff" : COLORS.slate, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Log in</button>
          <button onClick={() => setMode("signup")} style={{ flex: 1, padding: "9px 0", borderRadius: 4, border: `1px solid ${COLORS.paperLine}`, background: mode === "signup" ? COLORS.slate : "#fff", color: mode === "signup" ? "#fff" : COLORS.slate, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Start free trial</button>
        </div>

        {mode === "signup" && (
          <>
            <Field label="Business name"><TextInput value={form.businessName} onChange={set("businessName")} placeholder="CMFS Gutter Services" /></Field>
            <Field label="Your name"><TextInput value={form.ownerName} onChange={set("ownerName")} placeholder="Cris" /></Field>
            <Field label="Phone (optional)"><TextInput value={form.phone} onChange={set("phone")} placeholder="(810) 333-1636" /></Field>
          </>
        )}
        <Field label="Email"><TextInput type="email" value={form.email} onChange={set("email")} placeholder="you@business.com" /></Field>
        <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined}>
          <TextInput type="password" value={form.password} onChange={set("password")} placeholder="••••••••" />
        </Field>

        <Button onClick={submit} disabled={loading} variant="primary" style={{ width: "100%", justifyContent: "center", marginTop: 4 }}>
          {loading ? <Loader2 size={16} className="spin" /> : null}
          {mode === "login" ? "Log in" : "Start free trial"}
        </Button>
        {error && <div style={{ color: COLORS.orange, fontSize: 13, marginTop: 10, fontWeight: 600 }}>{error}</div>}
      </div>
    </div>
  );
}

// ---------- Plan / trial banner ----------
function PlanBanner({ auth }) {
  const { company, plan, user } = auth;
  const [upgrading, setUpgrading] = useState(null);
  const [error, setError] = useState("");
  if (!company || !plan) return null;

  const isTrial = company.plan === "trial";
  const daysLeft = isTrial ? Math.max(0, Math.ceil((new Date(company.trial_ends_at) - new Date()) / 86400000)) : null;
  const expired = isTrial && daysLeft === 0;

  const upgrade = async (targetPlan) => {
    setError(""); setUpgrading(targetPlan);
    try {
      const data = await apiFetch("/api/billing/create-checkout-session", { token: auth.token, method: "POST", body: { plan: targetPlan } });
      window.location.href = data.url;
    } catch (e) {
      setError(e.message || "Couldn't start checkout");
      setUpgrading(null);
    }
  };

  return (
    <div style={{ background: expired ? "#FDECE6" : COLORS.paper, borderBottom: `1px solid ${COLORS.paperLine}`, padding: "10px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontFamily: FONT_BODY, fontSize: 13 }}>
      <span style={{ fontWeight: 600, color: expired ? COLORS.orange : COLORS.slate, display: "flex", alignItems: "center", gap: 6 }}>
        {isTrial ? <Clock size={14} /> : <Crown size={14} />}
        {isTrial ? (expired ? "Your free trial has ended" : `Free trial — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left`) : plan.label}
      </span>
      {user?.role === "owner" && (isTrial || company.plan === "plan_1999") && (
        <>
          {company.plan === "trial" && (
            <button onClick={() => upgrade("plan_1999")} disabled={upgrading} style={{ background: "none", border: `1px solid ${COLORS.paperLine}`, borderRadius: 4, padding: "5px 10px", fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: COLORS.slate, cursor: "pointer" }}>
              {upgrading === "plan_1999" ? "Redirecting…" : "Choose $19.99/mo"}
            </button>
          )}
          <button onClick={() => upgrade("plan_3999")} disabled={upgrading} style={{ background: COLORS.orange, border: "none", borderRadius: 4, padding: "5px 10px", fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>
            {upgrading === "plan_3999" ? "Redirecting…" : "Upgrade to $39.99/mo — voice + 10 users"}
          </button>
        </>
      )}
      {error && <span style={{ color: COLORS.orange }}>{error}</span>}
    </div>
  );
}

// ---------- Settings screen (owner only) ----------
function SettingsScreen({ auth }) {
  const [form, setForm] = useState(companyToSettingsForm(auth.company));
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState("");
  const [extracting, setExtracting] = useState(false);

  useEffect(() => setForm(companyToSettingsForm(auth.company)), [auth.company]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRate = (bucket) => (row, col, value) => setForm((f) => ({ ...f, [bucket]: { ...f[bucket], [row]: { ...f[bucket][row], [col]: value } } }));
  const setStandardFt = (story) => (e) => setForm((f) => ({ ...f, downspoutStandardFt: { ...f.downspoutStandardFt, [story]: e.target.value } }));

  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result;
      setForm((f) => ({ ...f, logoDataUrl: dataUrl }));
      setExtracting(true);
      const accent = await extractAccentColor(dataUrl);
      setExtracting(false);
      if (accent) setForm((f) => ({ ...f, brandAccent: accent, brandDark: darkenHex(accent, 0.55) }));
    };
    reader.readAsDataURL(file);
  };
  const removeLogo = () => setForm((f) => ({ ...f, logoDataUrl: null, brandAccent: null, brandDark: null }));

  const onSave = async () => {
    setError("");
    const missing = [];
    if (!form.businessName.trim()) missing.push("Business name");
    if (!form.phone.trim()) missing.push("Phone");
    if (!form.email.trim()) missing.push("Email");
    if (missing.length) { setError(`Missing: ${missing.join(", ")}`); return; }
    try {
      await apiFetch("/api/company", { token: auth.token, method: "PUT", body: settingsFormToApiPayload(form) });
      await auth.refreshCompany();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1800);
    } catch (e) {
      setError(e.message || "Couldn't save settings");
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionHeading eyebrow="Setup" title="Your business" />
      <Field label="Business name"><TextInput value={form.businessName} onChange={set("businessName")} placeholder="CMFS Gutter Services" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Phone"><TextInput value={form.phone} onChange={set("phone")} placeholder="(810) 333-1636" /></Field>
        <Field label="License # (optional)"><TextInput value={form.license} onChange={set("license")} placeholder="MI-12345" /></Field>
      </div>
      <Field label="Reply-to email on estimates"><TextInput type="email" value={form.email} onChange={set("email")} placeholder="office@cmfsgutters.com" /></Field>

      <div style={{ margin: "28px 0 16px", paddingTop: 20, borderTop: `1px solid ${COLORS.paperLine}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 600, color: COLORS.slate, letterSpacing: 0.2 }}>Branding</div>
          {!auth.plan?.features?.branding && <span style={{ fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, color: "#fff", background: COLORS.steel, padding: "2px 8px", borderRadius: 999 }}>UPGRADE TO USE</span>}
        </div>
        <div style={{ fontFamily: FONT_BODY, fontSize: 13, color: COLORS.steel, marginTop: 2 }}>Upload your logo and every estimate is themed in your colors automatically.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ width: 84, height: 84, borderRadius: 6, border: `1px dashed ${COLORS.paperLine}`, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", overflow: "hidden", flexShrink: 0 }}>
          {form.logoDataUrl ? <img src={form.logoDataUrl} alt="Logo" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <Upload size={20} color={COLORS.steel} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.slate, border: `1px solid ${COLORS.paperLine}`, background: "#fff", padding: "9px 14px", borderRadius: 4, cursor: "pointer" }}>
              <Upload size={14} /> {form.logoDataUrl ? "Replace logo" : "Upload logo"}
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: "none" }} />
            </span>
          </label>
          {form.logoDataUrl && <button onClick={removeLogo} type="button" style={{ background: "none", border: "none", color: COLORS.steel, fontFamily: FONT_BODY, fontSize: 12, cursor: "pointer", textAlign: "left", padding: 0 }}>Remove logo & reset to default theme</button>}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontSize: 12, color: COLORS.steel }}>
            {extracting ? (<><Loader2 size={13} className="spin" /> Pulling your brand color…</>) : form.brandAccent ? (<><span style={{ width: 14, height: 14, borderRadius: 3, background: form.brandAccent, display: "inline-block", border: `1px solid ${COLORS.paperLine}` }} />Estimates will use {form.brandAccent}</>) : "No logo yet — default theme"}
          </div>
        </div>
      </div>

      <SectionHeading eyebrow="Pricing" title="Gutter rate — $ per ft" hint="By story and size." />
      <Grid rowKeys={STORIES} colKeys={GUTTER_SIZES} colLabels={GUTTER_SIZE_LABEL} grid={form.gutterRates} onChange={setRate("gutterRates")} unit="$" rowHeader="STORY" />

      <SectionHeading eyebrow="Pricing" title="Downspouts" hint="Standard footage per story × $/ft rate by size." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
        {STORIES.map((story) => (
          <Field key={story} label={`${story} story — standard ft`}><TextInput type="number" min="0" step="1" value={form.downspoutStandardFt[story]} onChange={setStandardFt(story)} /></Field>
        ))}
      </div>
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>Downspout rate — $ per ft</div>
      <Grid rowKeys={STORIES} colKeys={DOWNSPOUT_SIZES} colLabels={DOWNSPOUT_SIZE_LABEL} grid={form.downspoutRates} onChange={setRate("downspoutRates")} unit="$" rowHeader="STORY" />

      <SectionHeading eyebrow="Pricing" title="Elbows — $ each" />
      <Grid rowKeys={ELBOW_TYPES} rowLabels={ELBOW_TYPE_LABEL} colKeys={DOWNSPOUT_SIZES} colLabels={DOWNSPOUT_SIZE_LABEL} grid={form.elbowRates} onChange={setRate("elbowRates")} unit="$" rowHeader="TYPE" />

      <SectionHeading eyebrow="Pricing" title="Accessories — $ each" />
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>End caps & miters</div>
      <Grid rowKeys={ACCESSORY_GUTTER_TYPES} rowLabels={ACCESSORY_GUTTER_LABEL} colKeys={GUTTER_SIZES} colLabels={GUTTER_SIZE_LABEL} grid={form.accessoryGutterRates} onChange={setRate("accessoryGutterRates")} unit="$" rowHeader="TYPE" />
      <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.ink, margin: "14px 0 6px" }}>Pipebands</div>
      <Grid rowKeys={PIPEBAND_ROW} rowLabels={PIPEBAND_LABEL} colKeys={DOWNSPOUT_SIZES} colLabels={DOWNSPOUT_SIZE_LABEL} grid={form.pipebandRates} onChange={setRate("pipebandRates")} unit="$" rowHeader="TYPE" />

      <SectionHeading eyebrow="Pricing" title="Guard & minimum" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Gutter guard price / ft"><TextInput type="number" min="0" step="0.01" value={form.guardPricePerFt} onChange={set("guardPricePerFt")} /></Field>
        <Field label="Minimum job charge"><TextInput type="number" min="0" step="0.01" value={form.minJob} onChange={set("minJob")} /></Field>
      </div>

      <SectionHeading eyebrow="Optional" title="Booking incentive" />
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, fontFamily: FONT_BODY, fontSize: 14, color: COLORS.ink }}>
        <input type="checkbox" checked={form.incentiveEnabled} onChange={(e) => setForm((f) => ({ ...f, incentiveEnabled: e.target.checked }))} />
        Include a complimentary incentive on every estimate
      </label>
      {form.incentiveEnabled && (
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
          <Field label="Incentive description"><TextInput value={form.incentiveText} onChange={set("incentiveText")} /></Field>
          <Field label="Stated value"><TextInput type="number" min="0" step="0.01" value={form.incentiveValue} onChange={set("incentiveValue")} /></Field>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
        <Button onClick={onSave} variant="primary"><Check size={16} /> Save settings</Button>
        {savedFlash && <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: COLORS.green, fontWeight: 600 }}>Saved</span>}
        {error && <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: COLORS.orange, fontWeight: 600 }}>{error}</span>}
      </div>
    </div>
  );
}

// ---------- Team screen (owner only) ----------
function TeamScreen({ auth }) {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const data = await apiFetch("/api/users", { token: auth.token });
    setUsers(data.users);
  }, [auth.token]);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const addUser = async () => {
    setError("");
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) { setError("Missing name, email, or password"); return; }
    setAdding(true);
    try {
      await apiFetch("/api/users", { token: auth.token, method: "POST", body: form });
      setForm({ name: "", email: "", password: "" });
      await load();
    } catch (e) {
      setError(e.message || "Couldn't add team member");
    } finally {
      setAdding(false);
    }
  };

  const removeUser = async (id) => {
    try {
      await apiFetch(`/api/users/${id}`, { token: auth.token, method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message || "Couldn't remove team member");
    }
  };

  const seatLimit = auth.plan?.seatLimit ?? "—";
  const seatCount = users?.length ?? "…";

  return (
    <div style={{ maxWidth: 560 }}>
      <SectionHeading eyebrow="Team" title="Your team" hint={`${seatCount} of ${seatLimit} seats used on ${auth.plan?.label || "your plan"}. Team members can build and submit estimates but can't see settings, pricing, or send anything themselves — you approve and send.`} />

      <div style={{ background: "#fff", border: `1px solid ${COLORS.paperLine}`, borderRadius: 6, padding: 18, marginBottom: 20 }}>
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>Add a team member</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 10, alignItems: "end" }}>
          <Field label="Name"><TextInput value={form.name} onChange={set("name")} placeholder="Alex" /></Field>
          <Field label="Email"><TextInput type="email" value={form.email} onChange={set("email")} placeholder="alex@crew.com" /></Field>
          <Field label="Set a password" hint="At least 8 characters"><TextInput type="password" value={form.password} onChange={set("password")} placeholder="••••••••" /></Field>
          <Button onClick={addUser} disabled={adding} variant="dark" style={{ marginBottom: 18 }}>{adding ? <Loader2 size={15} className="spin" /> : "Add"}</Button>
        </div>
        {error && <div style={{ color: COLORS.orange, fontSize: 13, fontWeight: 600 }}>{error}</div>}
      </div>

      {users === null ? (
        <div style={{ color: COLORS.steel, fontFamily: FONT_BODY, fontSize: 14 }}>Loading team…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map((u) => (
            <div key={u.id} style={{ background: "#fff", border: `1px solid ${COLORS.paperLine}`, borderRadius: 6, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: FONT_BODY }}>
              <div>
                <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 14 }}>{u.name} {u.role === "owner" && <span style={{ fontSize: 11, color: COLORS.orange, fontWeight: 700 }}>(OWNER)</span>}</div>
                <div style={{ fontSize: 12, color: COLORS.steel }}>{u.email}</div>
              </div>
              {u.role !== "owner" && (
                <button onClick={() => removeUser(u.id)} style={{ background: "none", border: `1px solid ${COLORS.paperLine}`, borderRadius: 4, padding: "6px 12px", fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, color: COLORS.steel, cursor: "pointer" }}>Remove</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- New estimate screen ----------
function NewEstimateScreen({ auth, onCreated }) {
  const settings = companyToSettingsForm(auth.company);
  const [customer, setCustomer] = useState({ name: "", address: "", email: "" });
  const [color, setColor] = useState("");
  const [includeGutter, setIncludeGutter] = useState(true);
  const [gutterFt, setGutterFt] = useState(emptyCountGrid(STORIES, GUTTER_SIZES));
  const [includeDownspouts, setIncludeDownspouts] = useState(true);
  const [downspoutCount, setDownspoutCount] = useState(emptyCountGrid(STORIES, DOWNSPOUT_SIZES));
  const [includeElbows, setIncludeElbows] = useState(true);
  const [elbowCount, setElbowCount] = useState(emptyCountGrid(ELBOW_TYPES, DOWNSPOUT_SIZES));
  const [includeAccessories, setIncludeAccessories] = useState(true);
  const [accessoryGutterCount, setAccessoryGutterCount] = useState(emptyCountGrid(ACCESSORY_GUTTER_TYPES, GUTTER_SIZES));
  const [pipebandCount, setPipebandCount] = useState(emptyCountGrid(PIPEBAND_ROW, DOWNSPOUT_SIZES));
  const [includeGuard, setIncludeGuard] = useState(true);
  const [guardLength, setGuardLength] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const setCust = (k) => (e) => setCustomer((c) => ({ ...c, [k]: e.target.value }));
  const setGutterCell = (story, col, val) => setGutterFt((g) => ({ ...g, [story]: { ...g[story], [col]: val } }));
  const setDownspoutCell = (story, col, val) => setDownspoutCount((g) => ({ ...g, [story]: { ...g[story], [col]: val } }));
  const setElbowCell = (type, col, val) => setElbowCount((g) => ({ ...g, [type]: { ...g[type], [col]: val } }));
  const setAccessoryGutterCell = (type, col, val) => setAccessoryGutterCount((g) => ({ ...g, [type]: { ...g[type], [col]: val } }));
  const setPipebandCell = (row, col, val) => setPipebandCount((g) => ({ ...g, [row]: { ...g[row], [col]: val } }));

  const handleVoiceParsed = (parsed) => {
    const filled = [];
    if (parsed.color) { setColor(parsed.color); filled.push(`color: ${parsed.color}`); }
    if (parsed.gutter) {
      setIncludeGutter(true);
      STORIES.forEach((story) => GUTTER_SIZES.forEach((size) => {
        const v = parsed.gutter?.[story]?.[size];
        if (v !== undefined && v !== null) { setGutterCell(story, size, String(v)); filled.push(`${story} ${GUTTER_SIZE_LABEL[size]} gutter: ${v} ft`); }
      }));
    }
    if (parsed.downspouts) {
      setIncludeDownspouts(true);
      STORIES.forEach((story) => DOWNSPOUT_SIZES.forEach((size) => {
        const v = parsed.downspouts?.[story]?.[size];
        if (v !== undefined && v !== null) { setDownspoutCell(story, size, String(v)); filled.push(`${story} ${size} downspout: ${v}`); }
      }));
    }
    if (parsed.guardLengthFt !== undefined && parsed.guardLengthFt !== null) {
      setIncludeGuard(true); setGuardLength(String(parsed.guardLengthFt)); filled.push(`guard: ${parsed.guardLengthFt} ft`);
    }
    return filled;
  };

  const calc = () => {
    const gutterLines = []; let gutterCost = 0;
    if (includeGutter) STORIES.forEach((story) => GUTTER_SIZES.forEach((size) => {
      const ft = Number(gutterFt[story][size]) || 0;
      if (ft > 0) {
        const rate = Number(settings.gutterRates?.[story]?.[size]) || 0;
        const amount = ft * rate; gutterCost += amount;
        gutterLines.push({ amount, label: `${story} story — ${GUTTER_SIZE_LABEL[size]} gutter — ${ft} ft` });
      }
    }));

    const downspoutLines = []; let downspoutCost = 0;
    if (includeDownspouts) STORIES.forEach((story) => {
      const standardFt = Number(settings.downspoutStandardFt?.[story]) || 0;
      DOWNSPOUT_SIZES.forEach((size) => {
        const count = Number(downspoutCount[story][size]) || 0;
        if (count > 0) {
          const rate = Number(settings.downspoutRates?.[story]?.[size]) || 0;
          const ft = count * standardFt; const amount = ft * rate; downspoutCost += amount;
          downspoutLines.push({ amount, label: `${story} story — ${DOWNSPOUT_SIZE_LABEL[size]} downspout — ${count} @ ${standardFt} ft = ${ft} ft` });
        }
      });
    });

    const elbowLines = []; let elbowCost = 0;
    if (includeElbows) ELBOW_TYPES.forEach((type) => DOWNSPOUT_SIZES.forEach((size) => {
      const count = Number(elbowCount[type][size]) || 0;
      if (count > 0) {
        const rate = Number(settings.elbowRates?.[type]?.[size]) || 0;
        const amount = count * rate; elbowCost += amount;
        elbowLines.push({ amount, label: `${ELBOW_TYPE_LABEL[type]} — ${DOWNSPOUT_SIZE_LABEL[size]} — ${count} @ ${currency(rate)}` });
      }
    }));

    const accessoryLines = []; let accessoryCost = 0;
    if (includeAccessories) {
      ACCESSORY_GUTTER_TYPES.forEach((type) => GUTTER_SIZES.forEach((size) => {
        const count = Number(accessoryGutterCount[type][size]) || 0;
        if (count > 0) {
          const rate = Number(settings.accessoryGutterRates?.[type]?.[size]) || 0;
          const amount = count * rate; accessoryCost += amount;
          accessoryLines.push({ amount, label: `${ACCESSORY_GUTTER_LABEL[type]} — ${GUTTER_SIZE_LABEL[size]} — ${count} @ ${currency(rate)}` });
        }
      }));
      DOWNSPOUT_SIZES.forEach((size) => {
        const count = Number(pipebandCount.pipeband[size]) || 0;
        if (count > 0) {
          const rate = Number(settings.pipebandRates?.pipeband?.[size]) || 0;
          const amount = count * rate; accessoryCost += amount;
          accessoryLines.push({ amount, label: `Pipeband — ${DOWNSPOUT_SIZE_LABEL[size]} — ${count} @ ${currency(rate)}` });
        }
      });
    }

    const guardLen = Number(guardLength) || 0;
    const guardCost = includeGuard ? guardLen * (Number(settings.guardPricePerFt) || 0) : 0;
    const subtotal = gutterCost + downspoutCost + elbowCost + accessoryCost + guardCost;
    const total = Math.max(subtotal, Number(settings.minJob) || 0);
    return { gutterLines, downspoutLines, elbowLines, accessoryLines, gutterCost, downspoutCost, elbowCost, accessoryCost, guardLen, guardCost, subtotal, total };
  };

  const submit = async () => {
    setError("");
    const missing = [];
    if (!customer.name.trim()) missing.push("Customer name");
    if (!customer.address.trim()) missing.push("Job address");
    if (!customer.email.trim()) missing.push("Customer email");
    if (missing.length) { setError(`Missing: ${missing.join(", ")}`); return; }

    setSubmitting(true);
    try {
      const totals = calc();
      const data = await apiFetch("/api/estimates", {
        token: auth.token, method: "POST",
        body: { customerName: customer.name, customerAddress: customer.address, customerEmail: customer.email, color, notes, totals },
      });
      setCreated(data.estimate);
      onCreated();
    } catch (e) {
      setError(e.message || "Couldn't create estimate");
    } finally {
      setSubmitting(false);
    }
  };

  if (auth.accessBlocked) {
    return <EmptyState icon={<Clock size={22} />} title="Your free trial has ended" body="Ask the account owner to choose a plan to keep building estimates." />;
  }

  if (created) {
    const isOwner = auth.user.role === "owner";
    return (
      <div style={{ maxWidth: 640 }}>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.paperLine}`, borderRadius: 6, padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Check size={18} color={COLORS.green} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: COLORS.slate }}>Estimate created for {created.customer_name}</div>
          </div>
          <div style={{ fontFamily: FONT_BODY, fontSize: 14, color: COLORS.steel, marginBottom: 16 }}>
            {isOwner ? "It's approved automatically since you created it — head to Estimates to send it." : "It's waiting on your contractor's approval — you'll see it move to Approved once they review it. Find it in the Estimates tab."}
          </div>
          <Button variant="dark" onClick={() => setCreated(null)}>Build another estimate</Button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640 }}>
      <SectionHeading eyebrow="Customer" title="Who's this for" />
      <Field label="Customer name"><TextInput value={customer.name} onChange={setCust("name")} placeholder="Rick Martin" /></Field>
      <Field label="Job address"><TextInput value={customer.address} onChange={setCust("address")} placeholder="6613 Roger Rd, Lexington, MI" /></Field>
      <Field label="Customer email"><TextInput type="email" value={customer.email} onChange={setCust("email")} placeholder="rick@email.com" /></Field>
      <Field label="Color" hint="Gutter, downspout, and trim color for this job"><TextInput value={color} onChange={(e) => setColor(e.target.value)} placeholder="White, Brown, Black, Bronze…" /></Field>

      {auth.plan?.features?.voice ? (
        <>
          <SectionHeading eyebrow="Speed it up" title="Voice entry" hint="Say the job out loud, or type it — measurements get pulled into the fields below for you to review." />
          <VoiceBlock auth={auth} onParsed={handleVoiceParsed} />
        </>
      ) : null}

      <BlockHeading title="Gutter footage by story & size" included={includeGutter} onToggle={setIncludeGutter} />
      {includeGutter && <Grid rowKeys={STORIES} colKeys={GUTTER_SIZES} colLabels={GUTTER_SIZE_LABEL} grid={gutterFt} onChange={setGutterCell} unit="ft" rowHeader="STORY" />}

      <BlockHeading title="Downspouts by story & size" hint="Enter the # of downspouts — footage is calculated for you." included={includeDownspouts} onToggle={setIncludeDownspouts} />
      {includeDownspouts && <Grid rowKeys={STORIES} colKeys={DOWNSPOUT_SIZES} colLabels={DOWNSPOUT_SIZE_LABEL} grid={downspoutCount} onChange={setDownspoutCell} unit="ea" rowHeader="STORY" />}

      <BlockHeading title="Elbows" included={includeElbows} onToggle={setIncludeElbows} />
      {includeElbows && <Grid rowKeys={ELBOW_TYPES} rowLabels={ELBOW_TYPE_LABEL} colKeys={DOWNSPOUT_SIZES} colLabels={DOWNSPOUT_SIZE_LABEL} grid={elbowCount} onChange={setElbowCell} unit="ea" rowHeader="TYPE" />}

      <BlockHeading title="Accessories" included={includeAccessories} onToggle={setIncludeAccessories} />
      {includeAccessories && (
        <>
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.ink, marginBottom: 6 }}>End caps & miters</div>
          <Grid rowKeys={ACCESSORY_GUTTER_TYPES} rowLabels={ACCESSORY_GUTTER_LABEL} colKeys={GUTTER_SIZES} colLabels={GUTTER_SIZE_LABEL} grid={accessoryGutterCount} onChange={setAccessoryGutterCell} unit="ea" rowHeader="TYPE" />
          <div style={{ fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, color: COLORS.ink, margin: "14px 0 6px" }}>Pipebands</div>
          <Grid rowKeys={PIPEBAND_ROW} rowLabels={PIPEBAND_LABEL} colKeys={DOWNSPOUT_SIZES} colLabels={DOWNSPOUT_SIZE_LABEL} grid={pipebandCount} onChange={setPipebandCell} unit="ea" rowHeader="TYPE" />
        </>
      )}

      <BlockHeading title="Gutter guard" included={includeGuard} onToggle={setIncludeGuard} />
      {includeGuard && <Field label="Guard length (ft)"><TextInput type="number" min="0" step="1" value={guardLength} onChange={(e) => setGuardLength(e.target.value)} placeholder="total ft" /></Field>}

      <SectionHeading eyebrow="Notes" title="Anything else" />
      <Field label="Notes (optional)"><TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Back of house only, ladder access from driveway" /></Field>

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8 }}>
        <Button onClick={submit} disabled={submitting} variant="dark">
          {submitting ? <Loader2 size={16} className="spin" /> : <ChevronRight size={16} />}
          {auth.user.role === "owner" ? "Build estimate" : "Submit for approval"}
        </Button>
        {error && <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: COLORS.orange, fontWeight: 600 }}>{error}</span>}
      </div>
    </div>
  );
}

// ---------- Voice measurements block ----------
function VoiceBlock({ auth, onParsed }) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [applied, setApplied] = useState("");
  const recognitionRef = useRef(null);
  const micSupported = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);

  const startListening = () => {
    setError(""); setApplied("");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setError("Microphone input isn't available here — type what you'd say instead."); return; }
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; recognition.interimResults = false; recognition.lang = "en-US";
      recognition.onresult = (event) => {
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) finalText += event.results[i][0].transcript + " ";
        setTranscript((t) => (t ? t + " " + finalText.trim() : finalText.trim()));
      };
      recognition.onerror = () => { setError("Mic access was blocked — type what you'd say instead."); setListening(false); };
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      recognition.start();
      setListening(true);
    } catch (e) {
      setError("Mic access isn't available here — type what you'd say instead.");
      setListening(false);
    }
  };
  const stopListening = () => { recognitionRef.current?.stop(); setListening(false); };

  const applyVoice = async () => {
    if (!transcript.trim()) { setError("Say or type the measurements first."); return; }
    setError(""); setApplied(""); setLoading(true);
    try {
      const parsed = await apiFetch("/api/parse-transcript", { token: auth.token, method: "POST", body: { transcript } });
      const filled = onParsed(parsed);
      setApplied(filled.length ? `Filled in: ${filled.join(", ")}. Review below before submitting.` : "Didn't catch any measurements — try being more specific.");
    } catch (e) {
      setError(e.message || "Couldn't parse that. Try rephrasing, or fill in manually below.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: "#fff", border: `1px solid ${COLORS.paperLine}`, borderRadius: 6, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Sparkles size={16} color={COLORS.orange} />
        <div style={{ fontFamily: FONT_BODY, fontSize: 14, fontWeight: 700, color: COLORS.ink }}>Talk or type the measurements</div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <button type="button" onClick={listening ? stopListening : startListening} style={{ width: 44, height: 44, borderRadius: "50%", border: "none", flexShrink: 0, background: listening ? COLORS.orange : COLORS.slate, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }} aria-label={listening ? "Stop listening" : "Start listening"}>
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <div style={{ flex: 1, minWidth: 220 }}>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder='e.g. "50 feet of 6 inch white on the first story, two downspouts 3x4 on the second story, guard on the whole run"' style={{ ...inputStyle, minHeight: 70, resize: "vertical", fontFamily: FONT_BODY }} />
          {listening && <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: COLORS.orange, marginTop: 4 }}>Listening…</div>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <Button onClick={applyVoice} disabled={loading} variant="ghost">
          {loading ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
          {loading ? "Filling in…" : "Fill in fields from this"}
        </Button>
      </div>
      {applied && <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: COLORS.green, marginTop: 8 }}>{applied}</div>}
      {error && <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: COLORS.orange, marginTop: 8 }}>{error}</div>}
      {!micSupported && <div style={{ fontFamily: FONT_BODY, fontSize: 11, color: COLORS.steel, marginTop: 8 }}>Voice capture depends on your browser/device — typing works everywhere.</div>}
    </div>
  );
}

// ---------- Estimates list (history + owner's approval queue, combined) ----------
function EstimatesScreen({ auth }) {
  const [estimates, setEstimates] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [actionState, setActionState] = useState({}); // id -> 'approving' | 'sending' | error string
  const isOwner = auth.user.role === "owner";

  const load = useCallback(async () => {
    const data = await apiFetch("/api/estimates", { token: auth.token });
    setEstimates(data.estimates);
  }, [auth.token]);

  useEffect(() => { load(); }, [load]);

  const setState = (id, val) => setActionState((s) => ({ ...s, [id]: val }));

  const approve = async (id) => {
    setState(id, "approving");
    try { await apiFetch(`/api/estimates/${id}/approve`, { token: auth.token, method: "POST" }); await load(); }
    catch (e) { setState(id, e.message || "Failed to approve"); return; }
    setState(id, null);
  };

  const send = async (id) => {
    setState(id, "sending");
    try { await apiFetch(`/api/estimates/${id}/send`, { token: auth.token, method: "POST" }); await load(); }
    catch (e) { setState(id, e.message || "Failed to send"); return; }
    setState(id, null);
  };

  const approveAndSend = async (id) => {
    setState(id, "sending");
    try { await apiFetch(`/api/estimates/${id}/approve-and-send`, { token: auth.token, method: "POST" }); await load(); }
    catch (e) { setState(id, e.message || "Failed to approve & send"); return; }
    setState(id, null);
  };

  if (estimates === null) return <div style={{ color: COLORS.steel, fontFamily: FONT_BODY, fontSize: 14 }}>Loading estimates…</div>;
  if (!estimates.length) {
    return <EmptyState icon={<FileText size={22} />} title="No estimates yet" body={isOwner ? "Estimates your team builds — and your own — show up here." : "Estimates you build show up here once submitted."} />;
  }

  const pendingCount = estimates.filter((e) => e.status === "pending_approval").length;

  return (
    <div style={{ maxWidth: 680 }}>
      <SectionHeading eyebrow="History" title="Estimates" hint={isOwner && pendingCount ? `${pendingCount} waiting on your approval` : undefined} />
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {estimates.map((e) => {
          const expanded = expandedId === e.id;
          const state = actionState[e.id];
          const isErrorState = typeof state === "string" && state !== "approving" && state !== "sending";
          return (
            <div key={e.id} style={{ background: "#fff", border: `1px solid ${COLORS.paperLine}`, borderRadius: 6, overflow: "hidden" }}>
              <button onClick={() => setExpandedId(expanded ? null : e.id)} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: FONT_BODY, cursor: "pointer" }}>
                <div>
                  <div style={{ fontWeight: 600, color: COLORS.ink, fontSize: 15 }}>{e.customer_name}</div>
                  <div style={{ fontSize: 12, color: COLORS.steel, marginTop: 2 }}>{new Date(e.created_at).toLocaleDateString()}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, color: COLORS.slate, fontWeight: 600 }}>{currency(e.totals.total)}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[e.status] }}>{STATUS_LABEL[e.status].toUpperCase()}</div>
                  </div>
                  {expanded ? <ChevronUp size={16} color={COLORS.steel} /> : <ChevronDown size={16} color={COLORS.steel} />}
                </div>
              </button>

              {expanded && (
                <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${COLORS.paperLine}` }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: FONT_BODY, fontSize: 13, marginTop: 14 }}>
                    <tbody>{estimateLines(e.totals).map((l, i) => <LineRow key={i} label={l.label} amount={l.amount} />)}</tbody>
                  </table>
                  {e.notes && <div style={{ fontFamily: FONT_BODY, fontSize: 12, color: COLORS.steel, marginTop: 10 }}><strong style={{ color: COLORS.ink }}>Notes:</strong> {e.notes}</div>}

                  {isOwner && e.status === "pending_approval" && (
                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <Button variant="ghost" onClick={() => approve(e.id)} disabled={state === "approving" || state === "sending"}>
                        {state === "approving" ? <Loader2 size={14} className="spin" /> : <ThumbsUp size={14} />} Approve only
                      </Button>
                      <Button variant="primary" onClick={() => approveAndSend(e.id)} disabled={state === "approving" || state === "sending"}>
                        {state === "sending" ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Approve & send
                      </Button>
                    </div>
                  )}
                  {isOwner && e.status === "approved" && (
                    <div style={{ marginTop: 14 }}>
                      <Button variant="primary" onClick={() => send(e.id)} disabled={state === "sending"}>
                        {state === "sending" ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Send to {e.customer_email}
                      </Button>
                    </div>
                  )}
                  {isErrorState && <div style={{ color: COLORS.orange, fontSize: 12, fontWeight: 600, marginTop: 8 }}>{state}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- App shell ----------
export default function App() {
  const auth = useAuth();
  const [tab, setTab] = useState("new");

  if (auth.loading) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, color: COLORS.steel }}>Loading…</div>;
  }
  if (!auth.token || !auth.user) {
    return <AuthScreen auth={auth} />;
  }

  const isOwner = auth.user.role === "owner";
  const tabs = [
    { id: "new", label: "New Estimate", icon: <Ruler size={16} /> },
    { id: "estimates", label: "Estimates", icon: <FileText size={16} /> },
    ...(isOwner ? [{ id: "team", label: "Team", icon: <Users size={16} /> }] : []),
    ...(isOwner ? [{ id: "settings", label: "Settings", icon: <Settings size={16} /> }] : []),
  ];

  return (
    <div style={{ background: COLORS.paper, minHeight: "100vh", fontFamily: FONT_BODY, color: COLORS.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
        .spin { animation: spin 0.8s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }
        input[type="checkbox"] { accent-color: ${COLORS.orange}; width: 16px; height: 16px; }
        textarea:focus, input:focus { outline: 2px solid ${COLORS.orange}33; }
      `}</style>

      <div style={{ background: COLORS.slateDeep, padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 4, background: COLORS.orange, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Building2 size={18} color="#fff" />
          </div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 22, color: "#fff", fontWeight: 600, letterSpacing: 0.3 }}>Gutter Estimate Builder</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: FONT_BODY, fontSize: 13, color: "#B9C4CD" }}>{auth.user.name} · {isOwner ? "Owner" : "Team"}</span>
          <button onClick={auth.logout} style={{ background: "none", border: "none", color: "#B9C4CD", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontFamily: FONT_BODY, fontSize: 13 }}>
            <LogOut size={14} /> Log out
          </button>
        </div>
      </div>

      <PlanBanner auth={auth} />

      <div style={{ display: "flex", borderBottom: `1px solid ${COLORS.paperLine}`, background: "#fff", overflowX: "auto" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 20px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${COLORS.orange}` : "2px solid transparent", color: tab === t.id ? COLORS.slate : COLORS.steel, fontWeight: 600, fontSize: 14, fontFamily: FONT_BODY, cursor: "pointer", whiteSpace: "nowrap" }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: "28px 24px 60px" }}>
        {tab === "new" && <NewEstimateScreen auth={auth} onCreated={() => {}} />}
        {tab === "estimates" && <EstimatesScreen auth={auth} />}
        {tab === "team" && isOwner && <TeamScreen auth={auth} />}
        {tab === "settings" && isOwner && <SettingsScreen auth={auth} />}
      </div>
    </div>
  );
}
