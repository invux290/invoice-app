require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let invoiceCounter = parseInt(process.env.INVOICE_COUNTER || '1');

app.post('/api/invoice', (req, res) => {
  try {
    const body = req.body || {};
    const sender  = body.sender  || {};
    const client  = body.client  || {};
    const items   = Array.isArray(body.items) ? body.items : [];
    const invoice = body.invoice || {};

    if (!sender.name)  return res.status(400).json({ error: 'Sender name is required.'           });
    if (!client.name)  return res.status(400).json({ error: 'Client name is required.'           });
    if (!items.length) return res.status(400).json({ error: 'At least one line item is required.' });

    const currency = invoice.currency || 'USD';
    const symbols  = { USD:'$', EUR:'\u20ac', GBP:'\u00a3', INR:'\u20b9', CAD:'CA$', AUD:'A$' };
    const sym      = symbols[currency] || (currency + ' ');
    const fmtMoney = n => sym + parseFloat(n || 0).toFixed(2);
    const fmtDate  = d => {
      if (!d) return '--';
      const dt = new Date(d);
      return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    };

    const subtotal  = items.reduce((s, i) => s + (parseFloat(i.qty||0) * parseFloat(i.rate||0)), 0);
    const taxRate   = parseFloat(invoice.taxRate  || 0);
    const discount  = parseFloat(invoice.discount || 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total     = Math.max(0, subtotal + taxAmount - discount);
    const invNumber = invoice.number || ('INV-' + String(invoiceCounter++).padStart(4,'0'));

    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data',  c => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="invoice-' + invNumber + '.pdf"');
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });

    const W = doc.page.width;  // 595
    const M = 50;
    const BRAND = '#4f46e5';
    const GRAY  = '#6b7280';
    const DARK  = '#111827';
    const LIGHT = '#f9fafb';
    const BORDER = '#e5e7eb';

    // ── Header bar ──────────────────────────────────────────
    doc.rect(0, 0, W, 90).fill(BRAND);

    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(26)
       .text('INVOICE', M, 22);
    doc.font('Helvetica').fontSize(11).fillColor('rgba(255,255,255,0.75)')
       .text('#' + invNumber, M, 52);

    doc.font('Helvetica').fontSize(9).fillColor('rgba(255,255,255,0.85)');
    doc.text('Issued: ' + fmtDate(invoice.date), W - 200, 30, { width: 150, align: 'right' });
    doc.text('Due:    ' + fmtDate(invoice.due),  W - 200, 46, { width: 150, align: 'right' });

    // ── From / To block ─────────────────────────────────────
    const blockY = 110;
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5)
       .text('FROM',    M,       blockY)
       .text('BILL TO', M + 260, blockY);

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
       .text(sender.name || '',  M,       blockY + 14)
       .text(client.name || '',  M + 260, blockY + 14);

    doc.font('Helvetica').fontSize(9).fillColor(GRAY);
    let sy = blockY + 30, cy = blockY + 30;
    if (sender.email)          { doc.text(sender.email,          M,       sy); sy += 13; }
    if (sender.phone)          { doc.text(sender.phone,          M,       sy); sy += 13; }
    if (sender.address)        { doc.text(sender.address,        M,       sy); }
    if (client.company)        { doc.text(client.company,        M + 260, cy); cy += 13; }
    if (client.email)          { doc.text(client.email,          M + 260, cy); cy += 13; }
    if (client.address)        { doc.text(client.address,        M + 260, cy); }

    // ── Divider ──────────────────────────────────────────────
    const divY = Math.max(sy, cy) + 20;
    doc.moveTo(M, divY).lineTo(W - M, divY).strokeColor(BORDER).lineWidth(1).stroke();

    // ── Line items table ─────────────────────────────────────
    const tTop = divY + 14;
    const colDesc = M;
    const colQty  = M + 295;
    const colRate = M + 355;
    const colAmt  = W - M - 60;

    // Table header
    doc.rect(M, tTop, W - M * 2, 22).fill(LIGHT);
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8);
    doc.text('DESCRIPTION', colDesc + 6, tTop + 7, { width: 240 });
    doc.text('QTY',  colQty,  tTop + 7, { width: 55,  align: 'right' });
    doc.text('RATE', colRate, tTop + 7, { width: 65,  align: 'right' });
    doc.text('AMOUNT', colAmt, tTop + 7, { width: 60, align: 'right' });

    let rowY = tTop + 30;
    items.forEach((item, idx) => {
      const qty    = parseFloat(item.qty  || 0);
      const rate   = parseFloat(item.rate || 0);
      const amount = qty * rate;
      const desc   = typeof item.desc === 'string' ? item.desc : (item.description || item.name || '');

      if (idx % 2 === 1) doc.rect(M, rowY - 4, W - M * 2, 22).fill('#fafafa');

      doc.fillColor(DARK).font('Helvetica').fontSize(9.5);
      doc.text(desc,            colDesc + 6, rowY, { width: 240 });
      doc.text(String(qty),     colQty,      rowY, { width: 55,  align: 'right' });
      doc.text(fmtMoney(rate),  colRate,     rowY, { width: 65,  align: 'right' });
      doc.fillColor(DARK).font('Helvetica-Bold')
         .text(fmtMoney(amount), colAmt,     rowY, { width: 60,  align: 'right' });

      doc.moveTo(M, rowY + 16).lineTo(W - M, rowY + 16)
         .strokeColor('#f3f4f6').lineWidth(0.5).stroke();
      rowY += 24;
    });

    // ── Totals ───────────────────────────────────────────────
    rowY += 8;
    doc.moveTo(M + 280, rowY).lineTo(W - M, rowY).strokeColor(BORDER).lineWidth(1).stroke();
    rowY += 10;

    const totLabelX = M + 290;
    const totValX   = W - M - 60;
    const totW      = 60;
    const lineH     = 18;

    const totRow = (label, value, color) => {
      doc.fillColor(color || GRAY).font('Helvetica').fontSize(9)
         .text(label, totLabelX, rowY, { width: 80 });
      doc.fillColor(color || DARK).font(color ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
         .text(value, totValX, rowY, { width: totW, align: 'right' });
      rowY += lineH;
    };

    totRow('Subtotal', fmtMoney(subtotal));
    if (taxRate > 0)  totRow('Tax (' + taxRate + '%)', fmtMoney(taxAmount));
    if (discount > 0) totRow('Discount', '- ' + fmtMoney(discount), '#ef4444');

    rowY += 4;
    doc.rect(M + 275, rowY, W - M - (M + 275), 28).fill(BRAND);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10)
       .text('TOTAL DUE', totLabelX, rowY + 9, { width: 80 })
       .text(fmtMoney(total), totValX, rowY + 9, { width: totW, align: 'right' });
    rowY += 38;

    // ── Notes ────────────────────────────────────────────────
    if (invoice.notes && invoice.notes.trim()) {
      rowY += 10;
      doc.moveTo(M, rowY).lineTo(W - M, rowY).strokeColor(BORDER).lineWidth(1).stroke();
      rowY += 12;
      doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8)
         .text('NOTES / PAYMENT TERMS', M, rowY);
      rowY += 13;
      doc.fillColor(DARK).font('Helvetica').fontSize(9)
         .text(invoice.notes.trim(), M, rowY, { width: W - M * 2 });
    }

    // ── Footer ───────────────────────────────────────────────
    doc.fillColor('#9ca3af').font('Helvetica').fontSize(8)
       .text('Generated by InvoiceKit', M, doc.page.height - 38, { width: W - M * 2, align: 'center' });

    doc.end();

  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});


app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/app.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('InvoiceKit running on port ' + PORT));

