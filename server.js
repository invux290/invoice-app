require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const puppeteer  = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let invoiceCounter = parseInt(process.env.INVOICE_COUNTER || '1');

// ── Reusable browser instance ────────────────────────────────────
let browser;
async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
  }
  return browser;
}

// ── Money + date helpers ─────────────────────────────────────────
function fmtMoney(n, sym) {
  const val = parseFloat(n || 0);
  return sym + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Build invoice HTML ────────────────────────────────────────────
function buildHTML(sender, client, items, invoice, sym, subtotal, taxRate, taxAmt, discount, total, invNumber) {
  const hasDiscount = discount > 0;
  const hasTax      = taxRate > 0;

  const itemRows = items.map((item, i) => {
    const qty    = parseFloat(item.qty  || 0);
    const rate   = parseFloat(item.rate || 0);
    const amount = qty * rate;
    const desc   = esc(item.desc || item.description || item.name || '');
    return `
      <tr class="${i % 2 === 1 ? 'even' : ''}">
        <td class="td-desc">${desc}</td>
        <td class="td-num">${qty}</td>
        <td class="td-num">${fmtMoney(rate, sym)}</td>
        <td class="td-num td-amt">${fmtMoney(amount, sym)}</td>
      </tr>`;
  }).join('');

  const senderLines = [esc(sender.email), esc(sender.phone), esc(sender.address)].filter(Boolean).join('<br>');
  const clientLines = [esc(client.company), esc(client.email), esc(client.address)].filter(Boolean).join('<br>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --blue:      #1A56DB;
    --navy:      #0F2A6E;
    --blue-soft: #EFF6FF;
    --blue-line: #BFDBFE;
    --ink:       #0F172A;
    --ink-mid:   #334155;
    --ink-soft:  #64748B;
    --ink-faint: #94A3B8;
    --border:    #E2E8F0;
    --surface:   #F8FAFC;
    --white:     #FFFFFF;
    --red:       #DC2626;
  }

  html, body {
    width: 210mm;
    font-family: 'DM Sans', sans-serif;
    background: var(--white);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    font-size: 10pt;
  }

  /* ── HEADER ─────────────────────────────────────── */
  .header {
    background: var(--navy);
    padding: 36px 52px 32px;
    position: relative;
    overflow: hidden;
  }
  .header-orb1 {
    position: absolute; top: -50px; right: -50px;
    width: 220px; height: 220px; border-radius: 50%;
    background: rgba(255,255,255,0.06);
  }
  .header-orb2 {
    position: absolute; bottom: -30px; right: 80px;
    width: 130px; height: 130px; border-radius: 50%;
    background: rgba(255,255,255,0.04);
  }
  .header-inner {
    position: relative; z-index: 1;
    display: flex; justify-content: space-between; align-items: flex-start;
  }
  .header-left {}
  .inv-title {
    font-size: 36pt; font-weight: 700; color: var(--white);
    letter-spacing: -0.5px; line-height: 1;
  }
  .inv-number {
    font-family: 'DM Mono', monospace;
    font-size: 9pt; color: rgba(255,255,255,0.4);
    margin-top: 8px; letter-spacing: 0.5px;
  }
  .header-right { text-align: right; }
  .date-block { margin-bottom: 14px; }
  .date-block:last-child { margin-bottom: 0; }
  .date-label {
    font-size: 6.5pt; font-weight: 700; letter-spacing: 2px;
    color: rgba(255,255,255,0.35); text-transform: uppercase; margin-bottom: 3px;
  }
  .date-value {
    font-size: 12pt; font-weight: 700; color: var(--white); line-height: 1;
  }
  .header-stripe {
    height: 5px;
    background: linear-gradient(90deg, var(--blue) 0%, #60A5FA 100%);
  }

  /* ── BODY ───────────────────────────────────────── */
  .body { padding: 0 52px 52px; }

  /* ── PARTIES ────────────────────────────────────── */
  .parties {
    display: grid; grid-template-columns: 1fr 1fr; gap: 40px;
    padding: 36px 0 32px;
    border-bottom: 1px solid var(--border);
  }
  .party-label-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .party-label-line { width: 22px; height: 2px; }
  .party-label-line.from { background: var(--blue); }
  .party-label-line.to   { background: var(--ink-faint); }
  .party-label {
    font-size: 6.5pt; font-weight: 700; letter-spacing: 2px;
    text-transform: uppercase;
  }
  .party-label.from { color: var(--blue); }
  .party-label.to   { color: var(--ink-soft); }
  .party-name {
    font-size: 13pt; font-weight: 700; color: var(--ink);
    margin-bottom: 6px; line-height: 1.2;
  }
  .party-detail {
    font-size: 8.5pt; color: var(--ink-soft);
    line-height: 1.8;
  }

  /* ── TABLE ──────────────────────────────────────── */
  .table-wrap { margin-top: 28px; }
  table {
    width: 100%; border-collapse: collapse;
  }
  thead tr {
    background: var(--ink);
  }
  thead th {
    font-size: 7pt; font-weight: 700; letter-spacing: 1.2px;
    text-transform: uppercase; color: var(--white);
    padding: 11px 12px;
  }
  thead th:first-child { text-align: left; padding-left: 16px; }
  thead th:not(:first-child) { text-align: right; }

  tbody tr { background: var(--white); }
  tbody tr.even { background: var(--surface); }
  tbody tr.even td:first-child { border-left: 3px solid var(--blue-line); }

  td { padding: 10px 12px; border-bottom: 1px solid var(--border); vertical-align: middle; }
  .td-desc {
    font-size: 9.5pt; color: var(--ink-mid); font-weight: 400;
    padding-left: 16px;
  }
  .td-num {
    font-size: 9pt; color: var(--ink-soft);
    text-align: right; font-variant-numeric: tabular-nums;
  }
  .td-amt {
    font-size: 9.5pt; font-weight: 700; color: var(--ink);
  }
  .table-foot-rule {
    height: 3px;
    background: linear-gradient(90deg, var(--blue) 0%, #60A5FA 100%);
  }

  /* ── TOTALS ─────────────────────────────────────── */
  .totals-wrap {
    display: flex; justify-content: flex-end;
    margin-top: 20px;
  }
  .totals-card {
    width: 248px;
  }
  .totals-rows {
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 10px 10px 0 0;
    padding: 14px 18px 10px;
  }
  .tot-row {
    display: flex; justify-content: space-between;
    font-size: 9pt; margin-bottom: 8px; align-items: center;
  }
  .tot-row:last-child { margin-bottom: 0; }
  .tot-label { color: var(--ink-soft); }
  .tot-value { font-weight: 600; color: var(--ink-mid); font-variant-numeric: tabular-nums; }
  .tot-value.red { color: var(--red); }
  .total-band {
    background: var(--blue);
    border-radius: 0 0 10px 10px;
    padding: 14px 18px;
    display: flex; justify-content: space-between; align-items: center;
    position: relative; overflow: hidden;
  }
  .total-band::before {
    content: '';
    position: absolute; top: 0; left: 0; right: 0; height: 12px;
    background: rgba(255,255,255,0.12);
  }
  .total-band::after {
    content: '';
    position: absolute; top: 0; left: 0; width: 4px; height: 100%;
    background: var(--navy);
  }
  .total-label {
    font-size: 9pt; font-weight: 700; color: var(--white);
    letter-spacing: 0.5px; padding-left: 4px; position: relative; z-index: 1;
  }
  .total-value {
    font-size: 16pt; font-weight: 700; color: var(--white);
    font-variant-numeric: tabular-nums; position: relative; z-index: 1;
  }

  /* ── NOTES ──────────────────────────────────────── */
  .notes-wrap { margin-top: 32px; }
  .notes-head {
    background: var(--surface);
    border: 1px solid var(--border);
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    padding: 8px 14px;
    display: flex; align-items: center; gap: 8px;
  }
  .notes-head-bar { width: 3px; height: 14px; background: var(--blue); border-radius: 2px; }
  .notes-head-label {
    font-size: 6.5pt; font-weight: 700; letter-spacing: 1.5px;
    text-transform: uppercase; color: var(--ink-soft);
  }
  .notes-body {
    background: var(--white);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 8px 8px;
    padding: 14px;
    font-size: 8.5pt; color: var(--ink-mid); line-height: 1.7;
    white-space: pre-wrap;
  }

  /* ── FOOTER ─────────────────────────────────────── */
  .footer {
    margin-top: 48px;
    background: var(--ink);
    padding: 14px 52px;
    border-top: 3px solid var(--blue);
  }
  .footer-text {
    text-align: center;
    font-size: 7.5pt; color: rgba(255,255,255,0.25);
    line-height: 1.8;
  }
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-orb1"></div>
  <div class="header-orb2"></div>
  <div class="header-inner">
    <div class="header-left">
      <div class="inv-title">INVOICE</div>
      <div class="inv-number">${esc(invNumber)}</div>
    </div>
    <div class="header-right">
      <div class="date-block">
        <div class="date-label">Issued</div>
        <div class="date-value">${fmtDate(invoice.date)}</div>
      </div>
      <div class="date-block">
        <div class="date-label">Due Date</div>
        <div class="date-value">${fmtDate(invoice.due)}</div>
      </div>
    </div>
  </div>
</div>
<div class="header-stripe"></div>

<!-- BODY -->
<div class="body">

  <!-- PARTIES -->
  <div class="parties">
    <div class="party">
      <div class="party-label-row">
        <div class="party-label-line from"></div>
        <span class="party-label from">From</span>
      </div>
      <div class="party-name">${esc(sender.name)}</div>
      <div class="party-detail">${senderLines || '—'}</div>
    </div>
    <div class="party">
      <div class="party-label-row">
        <div class="party-label-line to"></div>
        <span class="party-label to">Bill To</span>
      </div>
      <div class="party-name">${esc(client.name)}</div>
      <div class="party-detail">${clientLines || '—'}</div>
    </div>
  </div>

  <!-- TABLE -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>
    <div class="table-foot-rule"></div>
  </div>

  <!-- TOTALS -->
  <div class="totals-wrap">
    <div class="totals-card">
      <div class="totals-rows">
        <div class="tot-row">
          <span class="tot-label">Subtotal</span>
          <span class="tot-value">${fmtMoney(subtotal, sym)}</span>
        </div>
        ${hasTax ? `<div class="tot-row">
          <span class="tot-label">Tax (${taxRate}%)</span>
          <span class="tot-value">${fmtMoney(taxAmt, sym)}</span>
        </div>` : ''}
        ${hasDiscount ? `<div class="tot-row">
          <span class="tot-label">Discount</span>
          <span class="tot-value red">– ${fmtMoney(discount, sym)}</span>
        </div>` : ''}
      </div>
      <div class="total-band">
        <span class="total-label">TOTAL DUE</span>
        <span class="total-value">${fmtMoney(total, sym)}</span>
      </div>
    </div>
  </div>

  ${invoice.notes && invoice.notes.trim() ? `
  <!-- NOTES -->
  <div class="notes-wrap">
    <div class="notes-head">
      <div class="notes-head-bar"></div>
      <span class="notes-head-label">Notes / Payment Terms</span>
    </div>
    <div class="notes-body">${esc(invoice.notes.trim())}</div>
  </div>` : ''}

</div>

<!-- FOOTER -->
<div class="footer">
  <div class="footer-text">
    Generated by InvoiceKit &nbsp;·&nbsp; invoicekit.onrender.com<br>
    No data stored &nbsp;·&nbsp; Private &amp; Secure
  </div>
</div>

</body>
</html>`;
}

// ── Route ─────────────────────────────────────────────────────────
app.post('/api/invoice', async (req, res) => {
  try {
    const body    = req.body || {};
    const sender  = body.sender  || {};
    const client  = body.client  || {};
    const items   = Array.isArray(body.items) ? body.items : [];
    const invoice = body.invoice || {};

    if (!sender.name)  return res.status(400).json({ error: 'Sender name is required.' });
    if (!client.name)  return res.status(400).json({ error: 'Client name is required.' });
    if (!items.length) return res.status(400).json({ error: 'At least one line item is required.' });

    const currency = invoice.currency || 'USD';
    const symbols  = { USD:'$', EUR:'€', GBP:'£', INR:'₹', CAD:'CA$', AUD:'A$' };
    const sym      = symbols[currency] || (currency + ' ');

    const subtotal  = items.reduce((s, i) => s + parseFloat(i.qty||0) * parseFloat(i.rate||0), 0);
    const taxRate   = parseFloat(invoice.taxRate  || 0);
    const discount  = parseFloat(invoice.discount || 0);
    const taxAmt    = subtotal * (taxRate / 100);
    const total     = Math.max(0, subtotal + taxAmt - discount);
    const invNumber = invoice.number || ('INV-' + String(invoiceCounter++).padStart(4, '0'));

    const html = buildHTML(sender, client, items, invoice, sym, subtotal, taxRate, taxAmt, discount, total, invNumber);

    const b   = await getBrowser();
    const pg  = await b.newPage();
    await pg.setContent(html, { waitUntil: 'networkidle0' });

    const pdf = await pg.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await pg.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invNumber}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);

  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/app.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`InvoiceKit running on port ${PORT}`));
