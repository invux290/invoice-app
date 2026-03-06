require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const path      = require('path');
const puppeteer = require('puppeteer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let invoiceCounter = parseInt(process.env.INVOICE_COUNTER || '1');

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
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildHTML(sender, client, items, invoice, sym, subtotal, taxRate, taxAmt, discount, total, invNumber) {
  const currency   = invoice.currency || 'USD';
  const hasTax     = taxRate > 0;
  const hasDisc    = discount > 0;
  const hasNotes   = invoice.notes && invoice.notes.trim();

  const senderDetail = [sender.email, sender.phone, sender.address].filter(Boolean).join('<br>');
  const clientDetail = [client.company, client.email, client.address].filter(Boolean).join('<br>');

  const itemRows = items.map((item, i) => {
    const qty    = parseFloat(item.qty  || 0);
    const rate   = parseFloat(item.rate || 0);
    const amount = qty * rate;
    const desc   = esc(item.desc || item.description || item.name || '');
    return `
    <div class="item-row ${i % 2 === 1 ? 'odd' : ''}">
      <span class="col-desc">${desc}</span>
      <span class="col-c">${qty}</span>
      <span class="col-r">${fmtMoney(rate, sym)}</span>
      <span class="col-r amt">${fmtMoney(amount, sym)}</span>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --blue:        #1A56DB;
    --blue-dark:   #1447B7;
    --blue-mid:    #2563EB;
    --blue-soft:   #EFF6FF;
    --blue-border: #DBEAFE;
    --ink:         #0B1120;
    --ink-mid:     #2D3748;
    --ink-soft:    #64748B;
    --ink-faint:   #94A3B8;
    --border:      #E2E8F2;
    --surface:     #F7F9FC;
    --white:       #FFFFFF;
  }

  html, body {
    font-family: 'DM Sans', sans-serif;
    background: var(--white);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    width: 680px;
  }

  /* ── CARD WRAPPER ── */
  .card {
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 18px;
    overflow: hidden;
    width: 680px;
  }

  /* ── HEADER ── */
  .prev-head {
    background: linear-gradient(145deg, #1447B7 0%, #1A56DB 45%, #2563EB 100%);
    padding: 28px 28px 24px;
    position: relative;
    overflow: hidden;
  }
  .orb1 {
    position: absolute; top: -30px; right: -30px;
    width: 150px; height: 150px; border-radius: 50%;
    background: rgba(255,255,255,0.07);
  }
  .orb2 {
    position: absolute; bottom: -25px; left: 40px;
    width: 100px; height: 100px; border-radius: 50%;
    background: rgba(255,255,255,0.05);
  }
  .head-inner {
    position: relative; z-index: 1;
    display: flex; justify-content: space-between; align-items: flex-start;
  }
  .inv-label {
    font-size: 8px; font-weight: 700;
    color: rgba(255,255,255,0.45);
    letter-spacing: 0.14em; text-transform: uppercase;
    margin-bottom: 7px;
  }
  .inv-num {
    font-family: 'DM Mono', monospace;
    font-size: 22px; font-weight: 500;
    color: white; letter-spacing: -0.02em;
  }
  .head-dates { text-align: right; }
  .date-group { margin-bottom: 10px; }
  .date-group:last-child { margin-bottom: 0; }
  .date-lbl {
    font-size: 7.5px; font-weight: 700;
    color: rgba(255,255,255,0.4);
    letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 3px;
  }
  .date-val {
    font-size: 13px; font-weight: 700;
    color: rgba(255,255,255,0.9);
    line-height: 1;
  }

  /* ── PARTIES ── */
  .prev-parties {
    display: grid; grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--border);
  }
  .prev-party { padding: 18px 22px; }
  .prev-party:first-child { border-right: 1px solid var(--border); }
  .party-lbl {
    font-size: 7.5px; font-weight: 700;
    color: var(--blue); text-transform: uppercase;
    letter-spacing: 0.1em; margin-bottom: 6px;
  }
  .party-name {
    font-size: 13px; font-weight: 700;
    color: var(--ink); margin-bottom: 4px; line-height: 1.3;
  }
  .party-detail {
    font-size: 11px; color: var(--ink-faint);
    line-height: 1.7;
  }

  /* ── ITEMS TABLE ── */
  .items-wrap { padding: 18px 22px 0; }
  .items-head {
    display: grid; grid-template-columns: 1fr 54px 100px 100px;
    gap: 8px; padding-bottom: 10px;
    border-bottom: 1.5px solid var(--border);
  }
  .items-head span {
    font-size: 8px; font-weight: 700;
    color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.08em;
  }
  .items-head span.col-c { text-align: center; }
  .items-head span.col-r { text-align: right; }

  .item-row {
    display: grid; grid-template-columns: 1fr 54px 100px 100px;
    gap: 8px; padding: 10px 0;
    border-bottom: 1px solid var(--surface);
    align-items: center;
  }
  .item-row.odd { background: var(--surface); margin: 0 -22px; padding: 10px 22px; }
  .col-desc { font-size: 12px; font-weight: 500; color: var(--ink); }
  .col-c    { font-size: 11px; color: var(--ink-soft); text-align: center; }
  .col-r    { font-size: 11px; color: var(--ink-soft); text-align: right; font-variant-numeric: tabular-nums; }
  .col-r.amt { font-size: 12px; font-weight: 700; color: var(--ink); }

  /* ── TOTALS ── */
  .prev-totals { padding: 14px 22px; border-top: 1px solid var(--border); }
  .tot-row {
    display: flex; justify-content: space-between;
    font-size: 11px; margin-bottom: 7px;
  }
  .tot-row span:first-child { color: var(--ink-faint); }
  .tot-row span:last-child  { font-weight: 600; color: var(--ink-soft); font-variant-numeric: tabular-nums; }
  .total-band {
    display: flex; justify-content: space-between; align-items: center;
    background: linear-gradient(135deg, var(--blue-soft) 0%, #DBEAFE 100%);
    border: 1px solid var(--blue-border);
    border-radius: 12px; padding: 13px 16px; margin-top: 12px;
  }
  .total-lbl { font-size: 13px; font-weight: 700; color: var(--blue); }
  .total-amt { font-size: 16px; font-weight: 800; color: var(--blue); font-variant-numeric: tabular-nums; }

  /* ── NOTES ── */
  .notes-wrap { padding: 0 22px 0; border-top: 1px solid var(--border); }
  .notes-lbl {
    font-size: 7.5px; font-weight: 700;
    color: var(--ink-faint); text-transform: uppercase;
    letter-spacing: 0.1em; padding-top: 14px; margin-bottom: 7px;
  }
  .notes-body {
    font-size: 11px; color: var(--ink-soft);
    line-height: 1.7; padding-bottom: 16px;
    white-space: pre-wrap;
  }

  /* ── FOOTER ── */
  .prev-footer {
    padding: 11px 22px;
    background: var(--surface);
    border-top: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .footer-left { display: flex; align-items: center; gap: 7px; }
  .status-dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: #10B981;
    box-shadow: 0 0 0 3px rgba(16,185,129,0.15);
  }
  .footer-status { font-size: 11px; font-weight: 600; color: var(--ink-soft); }
  .footer-currency {
    font-size: 10px; font-weight: 700; color: var(--blue);
    background: var(--blue-soft); padding: 3px 11px; border-radius: 20px;
  }
</style>
</head>
<body>
<div class="card">

  <!-- HEADER -->
  <div class="prev-head">
    <div class="orb1"></div>
    <div class="orb2"></div>
    <div class="head-inner">
      <div>
        <div class="inv-label">Invoice</div>
        <div class="inv-num">${esc(invNumber)}</div>
      </div>
      <div class="head-dates">
        <div class="date-group">
          <div class="date-lbl">Issued</div>
          <div class="date-val">${fmtDate(invoice.date)}</div>
        </div>
        <div class="date-group">
          <div class="date-lbl">Due Date</div>
          <div class="date-val">${fmtDate(invoice.due)}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- PARTIES -->
  <div class="prev-parties">
    <div class="prev-party">
      <div class="party-lbl">From</div>
      <div class="party-name">${esc(sender.name)}</div>
      <div class="party-detail">${senderDetail || '—'}</div>
    </div>
    <div class="prev-party">
      <div class="party-lbl">Bill To</div>
      <div class="party-name">${esc(client.name)}</div>
      <div class="party-detail">${clientDetail || '—'}</div>
    </div>
  </div>

  <!-- ITEMS -->
  <div class="items-wrap">
    <div class="items-head">
      <span>Item</span>
      <span class="col-c">Qty</span>
      <span class="col-r">Rate</span>
      <span class="col-r">Amount</span>
    </div>
    ${itemRows}
  </div>

  <!-- TOTALS -->
  <div class="prev-totals">
    ${hasTax || hasDisc ? `
    <div class="tot-row"><span>Subtotal</span><span>${fmtMoney(subtotal, sym)}</span></div>` : ''}
    ${hasTax ? `
    <div class="tot-row"><span>Tax (${taxRate}%)</span><span>${fmtMoney(taxAmt, sym)}</span></div>` : ''}
    ${hasDisc ? `
    <div class="tot-row"><span>Discount</span><span style="color:#DC2626;">– ${fmtMoney(discount, sym)}</span></div>` : ''}
    <div class="total-band">
      <span class="total-lbl">Total Due</span>
      <span class="total-amt">${fmtMoney(total, sym)}</span>
    </div>
  </div>

  ${hasNotes ? `
  <!-- NOTES -->
  <div class="notes-wrap">
    <div class="notes-lbl">Notes / Payment Terms</div>
    <div class="notes-body">${esc(invoice.notes.trim())}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="prev-footer">
    <div class="footer-left">
      <div class="status-dot"></div>
      <span class="footer-status">Generated by InvoiceKit</span>
    </div>
    <span class="footer-currency">${esc(currency)}</span>
  </div>

</div>
</body>
</html>`;
}

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

    const b  = await getBrowser();
    const pg = await b.newPage();

    await pg.setViewport({ width: 680, height: 800 });
    await pg.setContent(html, { waitUntil: 'networkidle0' });

    // Get exact content height — no empty space
    const cardHeight = await pg.evaluate(() => {
      return document.querySelector('.card').getBoundingClientRect().height;
    });

    const pdf = await pg.pdf({
      width:           '680px',
      height:          `${Math.ceil(cardHeight) + 2}px`,
      printBackground: true,
      margin:          { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges:      '1'
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
