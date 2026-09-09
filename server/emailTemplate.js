function currency(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// company and estimate are raw Postgres rows (snake_case columns).
// estimate.totals is jsonb, so pg already hands it back as a parsed object.
function buildEstimateEmailHtml(company, estimate) {
  const totals = estimate.totals || {};
  const accent = company.brand_accent || "#E15A2B";
  const darkBg = company.brand_dark || "#1C2B39";

  const rows = [
    ...(totals.gutterLines || []),
    ...(totals.downspoutLines || []),
    ...(totals.elbowLines || []),
    ...(totals.accessoryLines || []),
    ...(totals.guardCost > 0 ? [{ label: `${totals.guardLen} ft. gutter guard`, amount: totals.guardCost }] : []),
  ];
  const rowsHtml = rows
    .map(
      (l) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #E4DFD3;color:#1F2530;">${l.label}</td><td style="padding:8px 0;border-bottom:1px solid #E4DFD3;text-align:right;color:#1F2530;">${currency(l.amount)}</td></tr>`
    )
    .join("");

  const incentiveHtml =
    company.incentive_enabled && company.incentive_text
      ? `<div style="margin-top:20px;background:#F6F4EF;border-left:3px solid ${accent};padding:12px 14px;font-size:13px;color:#1F2530;">
           <strong>Included:</strong> ${company.incentive_text}${company.incentive_value ? ` (${currency(company.incentive_value)} value)` : ""}
         </div>`
      : "";
  const notesHtml = estimate.notes
    ? `<div style="margin-top:16px;font-size:13px;color:#5B6B7A;"><strong style="color:#1F2530;">Notes:</strong> ${estimate.notes}</div>`
    : "";

  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:${darkBg};padding:22px 28px;">
      <div style="font-size:22px;color:#fff;font-weight:700;">${company.business_name || "Your Business"}</div>
      <div style="font-size:13px;color:#B9C4CD;margin-top:4px;">
        ${company.phone || ""} ${company.contact_email ? `· ${company.contact_email}` : ""} ${company.license ? `· Lic ${company.license}` : ""}
      </div>
    </div>
    <div style="padding:24px 28px;background:#fff;">
      <table style="width:100%;font-size:14px;margin-bottom:18px;">
        <tr>
          <td style="vertical-align:top;">
            <div style="color:#5B6B7A;font-size:12px;">Prepared for</div>
            <div style="font-weight:700;color:#1F2530;">${estimate.customer_name}</div>
            <div style="color:#1F2530;">${estimate.customer_address || ""}</div>
          </td>
          ${estimate.color ? `<td style="vertical-align:top;"><div style="color:#5B6B7A;font-size:12px;">Color</div><div style="color:#1F2530;">${estimate.color}</div></td>` : ""}
          <td style="vertical-align:top;">
            <div style="color:#5B6B7A;font-size:12px;">Date</div>
            <div style="color:#1F2530;">${new Date(estimate.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
          </td>
        </tr>
      </table>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead>
          <tr style="border-bottom:2px solid ${darkBg};">
            <th style="text-align:left;padding:0 0 8px;color:#5B6B7A;font-size:12px;">ITEM</th>
            <th style="text-align:right;padding:0 0 8px;color:#5B6B7A;font-size:12px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div style="text-align:right;margin-top:14px;padding-top:14px;border-top:1px solid #E4DFD3;">
        <div style="font-size:12px;color:#5B6B7A;">TOTAL</div>
        <div style="font-size:28px;color:${darkBg};font-weight:700;">${currency(totals.total)}</div>
      </div>
      ${incentiveHtml}
      ${notesHtml}
    </div>
  </div>`;
}

module.exports = { buildEstimateEmailHtml };
