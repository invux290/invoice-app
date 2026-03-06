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
      args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']
    });
  }
  return browser;
}

function money(n, sym) {
  return sym + parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function date(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function e(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function buildHTML(sender, client, items, invoice, sym, sub, taxRate, taxAmt, disc, total, num) {
  const hasTax  = taxRate > 0;
  const hasDisc = disc > 0;
  const hasNotes= !!(invoice.notes && invoice.notes.trim());
  const currency= invoice.currency || 'USD';

  const senderDetail = [sender.email, sender.phone, sender.address].filter(Boolean).map(e).join('<br>');
  const clientDetail = [client.company, client.email, client.address].filter(Boolean).map(e).join(' &nbsp;·&nbsp; ');

  const rows = items.map((item, i) => {
    const qty = parseFloat(item.qty||0), rate = parseFloat(item.rate||0), amt = qty*rate;
    return `<div class="item-row ${i%2===1?'odd':''}">
      <span class="td-desc">${e(item.desc||item.description||item.name||'')}</span>
      <span class="td-c">${qty}</span>
      <span class="td-r">${money(rate,sym)}</span>
      <span class="td-r bold">${money(amt,sym)}</span>
    </div>`;
  }).join('');

  const totRows = `
    <div class="tot-row"><span class="tot-lbl">Subtotal</span><span class="tot-val">${money(sub,sym)}</span></div>
    ${hasTax?`<div class="tot-row surface"><span class="tot-lbl">Tax (${taxRate}%)</span><span class="tot-val">${money(taxAmt,sym)}</span></div>`:''}
    ${hasDisc?`<div class="tot-row"><span class="tot-lbl">Discount</span><span class="tot-val red">– ${money(disc,sym)}</span></div>`:''}
  `;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --blue:#1A56DB; --navy:#0F2A6E; --blue-mid:#2563EB;
  --blue-soft:#EFF6FF; --blue-pale:#DBEAFE;
  --ink:#0F172A; --ink-mid:#1E293B; --ink-soft:#475569;
  --ink-faint:#94A3B8; --border:#E2E8F0; --surface:#F8FAFC; --white:#FFFFFF;
}
html,body{
  width:794px; font-family:'DM Sans',sans-serif;
  background:var(--white); color:var(--ink);
  -webkit-font-smoothing:antialiased; font-size:11px; line-height:1.5;
}
.page{display:grid; grid-template-columns:210px 1fr; min-height:100%;}

/* SIDEBAR */
.sidebar{background:var(--navy); position:relative; overflow:hidden;}
.orb1{position:absolute;top:-60px;right:-60px;width:200px;height:200px;border-radius:50%;background:rgba(255,255,255,0.05);}
.orb2{position:absolute;bottom:60px;left:-40px;width:160px;height:160px;border-radius:50%;background:rgba(26,86,219,0.25);}
.sb-stripe{position:absolute;right:0;top:0;bottom:0;width:3px;background:linear-gradient(to bottom,var(--blue-mid),transparent 70%);}
.sb-inner{position:relative;z-index:1;padding:40px 26px;height:100%;display:flex;flex-direction:column;}

.logo-mark{width:36px;height:36px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.14);border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:32px;}

.inv-word{font-size:8px;font-weight:700;letter-spacing:0.2em;color:rgba(255,255,255,0.3);text-transform:uppercase;margin-bottom:5px;}
.inv-num{font-family:'DM Mono',monospace;font-size:15px;font-weight:500;color:var(--white);letter-spacing:-0.01em;margin-bottom:32px;line-height:1.3;}

.sb-sec{margin-bottom:26px;}
.sb-lbl{font-size:7px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.28);text-transform:uppercase;margin-bottom:7px;}
.sb-name{font-size:12px;font-weight:700;color:var(--white);line-height:1.3;margin-bottom:4px;}
.sb-detail{font-size:9.5px;color:rgba(255,255,255,0.38);line-height:1.85;}

.sb-div{height:1px;background:rgba(255,255,255,0.07);margin:0 0 24px;}

.date-blk{margin-bottom:16px;}
.date-lbl{font-size:7px;font-weight:700;letter-spacing:0.16em;color:rgba(255,255,255,0.28);text-transform:uppercase;margin-bottom:3px;}
.date-val{font-size:11.5px;font-weight:600;color:rgba(255,255,255,0.82);}
.date-val.due{color:#60A5FA;}

.sb-foot{margin-top:auto;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);}
.sb-foot-txt{font-size:8px;color:rgba(255,255,255,0.18);line-height:1.9;}

/* MAIN */
.main{background:var(--white);padding:40px 36px 36px;display:flex;flex-direction:column;}

.billto{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:15px 18px;margin-bottom:32px;}
.bt-lbl{font-size:7px;font-weight:700;letter-spacing:0.18em;color:var(--blue);text-transform:uppercase;margin-bottom:5px;}
.bt-name{font-size:14px;font-weight:800;color:var(--ink);letter-spacing:-0.02em;margin-bottom:3px;}
.bt-detail{font-size:10px;color:var(--ink-faint);line-height:1.7;}

.sec-label{font-size:7px;font-weight:700;letter-spacing:0.18em;color:var(--ink-faint);text-transform:uppercase;margin-bottom:9px;display:flex;align-items:center;gap:8px;}
.sec-label::after{content:'';flex:1;height:1px;background:var(--border);}

/* TABLE */
.table-wrap{margin-bottom:22px;}
.table-head{display:grid;grid-template-columns:1fr 48px 84px 84px;gap:8px;padding:9px 13px;background:var(--ink);border-radius:8px 8px 0 0;}
.th{font-size:7px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.55);}
.th.r{text-align:right;} .th.c{text-align:center;}
.table-body{border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;overflow:hidden;}
.item-row{display:grid;grid-template-columns:1fr 48px 84px 84px;gap:8px;padding:10px 13px;align-items:center;border-bottom:1px solid var(--border);}
.item-row:last-child{border-bottom:none;}
.item-row.odd{background:var(--surface);}
.td-desc{font-size:10.5px;font-weight:500;color:var(--ink-mid);}
.td-c{font-size:10px;color:var(--ink-faint);text-align:center;}
.td-r{font-size:10px;color:var(--ink-faint);text-align:right;font-variant-numeric:tabular-nums;}
.td-r.bold{font-size:10.5px;font-weight:700;color:var(--ink);}

/* TOTALS */
.totals-area{display:flex;justify-content:flex-end;margin-bottom:26px;}
.totals-box{width:232px;}
.tot-rows{border:1px solid var(--border);border-radius:9px 9px 0 0;overflow:hidden;}
.tot-row{display:flex;justify-content:space-between;align-items:center;padding:9px 14px;font-size:10px;border-bottom:1px solid var(--border);background:var(--white);}
.tot-row:last-child{border-bottom:none;}
.tot-row.surface{background:var(--surface);}
.tot-lbl{color:var(--ink-soft);}
.tot-val{font-weight:600;color:var(--ink-mid);font-variant-numeric:tabular-nums;}
.tot-val.red{color:#DC2626;}
.total-due{display:flex;justify-content:space-between;align-items:center;background:var(--blue);border-radius:0 0 9px 9px;padding:12px 14px;}
.total-due-lbl{font-size:9px;font-weight:700;letter-spacing:0.06em;color:rgba(255,255,255,0.75);text-transform:uppercase;}
.total-due-amt{font-size:17px;font-weight:800;color:var(--white);font-variant-numeric:tabular-nums;letter-spacing:-0.02em;}

/* NOTES */
.notes-box{border:1px solid var(--border);border-left:3px solid var(--blue);border-radius:0 8px 8px 0;overflow:hidden;margin-bottom:28px;}
.notes-head{background:var(--surface);padding:7px 13px;font-size:7px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:var(--ink-faint);border-bottom:1px solid var(--border);}
.notes-body{padding:11px 13px;font-size:10px;color:var(--ink-soft);line-height:1.8;white-space:pre-wrap;background:var(--white);}

/* THANK YOU */
.thankyou{margin-top:auto;text-align:center;padding-top:22px;border-top:1px solid var(--border);}
.ty-main{font-size:11.5px;font-weight:600;color:var(--ink-faint);letter-spacing:0.01em;}
.ty-sub{font-size:8.5px;color:var(--border);margin-top:2px;}
</style>
</head>
<body>
<div class="page">

  <div class="sidebar">
    <div class="orb1"></div><div class="orb2"></div><div class="sb-stripe"></div>
    <div class="sb-inner">
      <div class="logo-mark">
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="2" y="3" width="16" height="2.5" rx="1" fill="white"/>
          <rect x="2" y="8" width="11" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>
          <rect x="2" y="12.5" width="7.5" height="2" rx="1" fill="rgba(255,255,255,0.35)"/>
        </svg>
      </div>

      <div class="inv-word">Invoice</div>
      <div class="inv-num">${e(num)}</div>

      <div class="sb-sec">
        <div class="sb-lbl">From</div>
        <div class="sb-name">${e(sender.name)}</div>
        <div class="sb-detail">${senderDetail||'—'}</div>
      </div>

      <div class="sb-div"></div>

      <div class="date-blk">
        <div class="date-lbl">Issue Date</div>
        <div class="date-val">${date(invoice.date)}</div>
      </div>
      <div class="date-blk">
        <div class="date-lbl">Due Date</div>
        <div class="date-val due">${date(invoice.due)}</div>
      </div>

      <div class="sb-foot">
        <div class="sb-foot-txt">InvoiceKit<br>invoicekit.onrender.com</div>
      </div>
    </div>
  </div>

  <div class="main">
    <div class="billto">
      <div class="bt-lbl">Bill To</div>
      <div class="bt-name">${e(client.name)}</div>
      <div class="bt-detail">${clientDetail||'—'}</div>
    </div>

    <div class="sec-label">Line Items</div>
    <div class="table-wrap">
      <div class="table-head">
        <span class="th">Description</span>
        <span class="th c">Qty</span>
        <span class="th r">Rate</span>
        <span class="th r">Amount</span>
      </div>
      <div class="table-body">${rows}</div>
    </div>

    <div class="totals-area">
      <div class="totals-box">
        <div class="tot-rows">${totRows}</div>
        <div class="total-due">
          <span class="total-due-lbl">Total Due</span>
          <span class="total-due-amt">${money(total,sym)}</span>
        </div>
      </div>
    </div>

    ${hasNotes?`
    <div class="sec-label">Notes</div>
    <div class="notes-box">
      <div class="notes-head">Payment Terms</div>
      <div class="notes-body">${e(invoice.notes.trim())}</div>
    </div>`:''}

    <div class="thankyou">
      <div class="ty-main">Thank you for your business.</div>
      <div class="ty-sub">Generated by InvoiceKit</div>
    </div>
  </div>

</div>
</body>
</html>`;
}

app.post('/api/invoice', async (req, res) => {
  try {
    const body   = req.body || {};
    const sender = body.sender  || {};
    const client = body.client  || {};
    const items  = Array.isArray(body.items) ? body.items : [];
    const invoice= body.invoice || {};

    if (!sender.name)  return res.status(400).json({ error: 'Sender name is required.' });
    if (!client.name)  return res.status(400).json({ error: 'Client name is required.' });
    if (!items.length) return res.status(400).json({ error: 'At least one line item is required.' });

    const currency = invoice.currency || 'USD';
    const sym = { USD:'$',EUR:'€',GBP:'£',INR:'₹',CAD:'CA$',AUD:'A$' }[currency] || (currency+' ');

    const sub     = items.reduce((s,i)=>s+parseFloat(i.qty||0)*parseFloat(i.rate||0),0);
    const taxRate = parseFloat(invoice.taxRate ||0);
    const disc    = parseFloat(invoice.discount||0);
    const taxAmt  = sub*(taxRate/100);
    const total   = Math.max(0, sub+taxAmt-disc);
    const num     = invoice.number || ('INV-'+String(invoiceCounter++).padStart(4,'0'));

    const html = buildHTML(sender,client,items,invoice,sym,sub,taxRate,taxAmt,disc,total,num);

    const b  = await getBrowser();
    const pg = await b.newPage();
    await pg.setViewport({ width: 794, height: 1200 });
    await pg.setContent(html, { waitUntil: 'networkidle0' });

    // Measure exact content height — zero empty space
    const h = await pg.evaluate(() => document.querySelector('.page').scrollHeight);

    const pdf = await pg.pdf({
      width: '794px',
      height: `${h + 1}px`,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1'
    });

    await pg.close();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${num}.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);

  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

app.get('/',         (req,res)=>res.sendFile(path.join(__dirname,'public','landing.html')));
app.get('/app',      (req,res)=>res.sendFile(path.join(__dirname,'public','app.html')));
app.get('/app.html', (req,res)=>res.sendFile(path.join(__dirname,'public','app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`InvoiceKit on port ${PORT}`));
