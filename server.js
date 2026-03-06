require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const PDFDocument = require('pdfkit');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let invoiceCounter = parseInt(process.env.INVOICE_COUNTER || '1');

app.post('/api/invoice', (req, res) => {
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

    // Safe money formatter — never overflows
    const fmtMoney = n => {
      const val = parseFloat(n || 0);
      const formatted = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return sym + formatted;
    };

    const fmtDate = d => {
      if (!d) return '—';
      const dt = new Date(d);
      return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const subtotal  = items.reduce((s, i) => s + parseFloat(i.qty||0) * parseFloat(i.rate||0), 0);
    const taxRate   = parseFloat(invoice.taxRate  || 0);
    const discount  = parseFloat(invoice.discount || 0);
    const taxAmt    = subtotal * (taxRate / 100);
    const total     = Math.max(0, subtotal + taxAmt - discount);
    const invNumber = invoice.number || ('INV-' + String(invoiceCounter++).padStart(4, '0'));

    const doc    = new PDFDocument({ margin: 0, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${invNumber}.pdf"`);
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });

    // ── Page geometry ─────────────────────────────────────────
    const PW  = doc.page.width;   // 595.28
    const PH  = doc.page.height;  // 841.89
    const ML  = 56;               // left margin
    const MR  = PW - 56;          // right edge
    const CW  = MR - ML;          // content width = 483.28

    // ── Colour system ─────────────────────────────────────────
    const BLUE      = '#1A56DB';
    const NAVY      = '#0F2A6E';
    const BLUE_SOFT = '#EFF6FF';
    const BLUE_LINE = '#BFDBFE';
    const INK       = '#0F172A';
    const INK_MID   = '#334155';
    const INK_SOFT  = '#64748B';
    const INK_FAINT = '#94A3B8';
    const BORDER    = '#E2E8F0';
    const SURFACE   = '#F8FAFC';
    const WHITE     = '#FFFFFF';
    const RED       = '#DC2626';

    // ── Utility: horizontal rule ──────────────────────────────
    const rule = (y, color, w, lw) => {
      doc.moveTo(ML, y).lineTo(ML + (w || CW), y)
         .strokeColor(color || BORDER).lineWidth(lw || 0.5).stroke();
    };

    // ── 1. WHITE BACKGROUND ───────────────────────────────────
    doc.rect(0, 0, PW, PH).fill(WHITE);

    // ── 2. HEADER ─────────────────────────────────────────────
    const HDR = 136;

    // Main header fill
    doc.rect(0, 0, PW, HDR).fill(NAVY);

    // Right-side decorative gradient shape
    // Large soft circle, top right
    doc.save();
    doc.circle(PW - 10, -10, 170).fillOpacity(0.08).fill(WHITE);
    doc.circle(PW - 70, HDR + 10, 90).fillOpacity(0.05).fill(WHITE);
    doc.restore();

    // Bottom accent stripe
    doc.rect(0, HDR - 5, PW, 5).fill(BLUE);

    // INVOICE wordmark
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(34)
       .text('INVOICE', ML, 28, { characterSpacing: 1 });

    // Invoice number chip
    doc.fillColor('rgba(255,255,255,0.4)').font('Helvetica').fontSize(9.5)
       .text(invNumber, ML, 72, { characterSpacing: 0.5 });

    // Dates — right aligned, stacked pairs
    const DX = MR;
    const DW = 160;

    // ISSUED
    doc.fillColor('rgba(255,255,255,0.38)').font('Helvetica').fontSize(7)
       .text('ISSUED', ML, 34, { width: DX - ML, align: 'right', characterSpacing: 1.8 });
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(12)
       .text(fmtDate(invoice.date), ML, 46, { width: DX - ML, align: 'right' });

    doc.fillColor('rgba(255,255,255,0.38)').font('Helvetica').fontSize(7)
       .text('DUE DATE', ML, 76, { width: DX - ML, align: 'right', characterSpacing: 1.8 });
    doc.fillColor('rgba(255,255,255,0.92)').font('Helvetica-Bold').fontSize(12)
       .text(fmtDate(invoice.due), ML, 88, { width: DX - ML, align: 'right' });

    // ── 3. FROM / BILL TO ─────────────────────────────────────
    let Y = HDR + 38;
    const COL_W = (CW - 40) / 2;
    const COL_L = ML;
    const COL_R = ML + COL_W + 40;

    // FROM label
    doc.rect(COL_L, Y, 20, 1.5).fill(BLUE);
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(7)
       .text('FROM', COL_L + 25, Y - 3, { characterSpacing: 1.5 });

    // BILL TO label
    doc.rect(COL_R, Y, 20, 1.5).fill(INK_FAINT);
    doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(7)
       .text('BILL TO', COL_R + 25, Y - 3, { characterSpacing: 1.5 });

    Y += 12;

    // FROM — name
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12.5)
       .text(sender.name || '', COL_L, Y, { width: COL_W });
    const fromNameH = doc.heightOfString(sender.name || '', { width: COL_W, fontSize: 12.5 });

    // BILL TO — name
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(12.5)
       .text(client.name || '', COL_R, Y, { width: COL_W });
    const toNameH = doc.heightOfString(client.name || '', { width: COL_W, fontSize: 12.5 });

    let fromY = Y + fromNameH + 5;
    let toY   = Y + toNameH   + 5;

    // FROM details
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9);
    [sender.email, sender.phone, sender.address].filter(Boolean).forEach(line => {
      doc.text(line, COL_L, fromY, { width: COL_W });
      fromY += doc.heightOfString(line, { width: COL_W, fontSize: 9 }) + 3;
    });

    // BILL TO details
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9);
    [client.company, client.email, client.address].filter(Boolean).forEach(line => {
      doc.text(line, COL_R, toY, { width: COL_W });
      toY += doc.heightOfString(line, { width: COL_W, fontSize: 9 }) + 3;
    });

    Y = Math.max(fromY, toY) + 30;

    // Divider
    rule(Y, BORDER, CW, 0.75);
    Y += 26;

    // ── 4. TABLE ──────────────────────────────────────────────
    // Column positions (right-anchored)
    const TAMT  = MR;               const TAMT_W  = 82;
    const TRATE = TAMT  - TAMT_W  - 8; const TRATE_W = 72;
    const TQTY  = TRATE - TRATE_W - 8; const TQTY_W  = 50;
    const TDESC = ML + 8;           const TDESC_W = TQTY - ML - 8 - 8;

    const ROW_H = 29;
    const HDR_H = 28;

    // Table header — dark row
    doc.rect(ML, Y, CW, HDR_H).fill(INK);

    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5);
    doc.text('DESCRIPTION', TDESC, Y + 10, { width: TDESC_W, characterSpacing: 0.7 });
    doc.text('QTY',  TQTY  - TQTY_W,  Y + 10, { width: TQTY_W,  align: 'right', characterSpacing: 0.7 });
    doc.text('RATE', TRATE - TRATE_W, Y + 10, { width: TRATE_W, align: 'right', characterSpacing: 0.7 });
    doc.text('AMOUNT', TAMT - TAMT_W, Y + 10, { width: TAMT_W,  align: 'right', characterSpacing: 0.7 });

    Y += HDR_H;

    items.forEach((item, idx) => {
      const qty    = parseFloat(item.qty  || 0);
      const rate   = parseFloat(item.rate || 0);
      const amount = qty * rate;
      const desc   = String(item.desc || item.description || item.name || '');
      const even   = idx % 2 === 0;

      // Zebra stripe
      doc.rect(ML, Y, CW, ROW_H).fill(even ? WHITE : SURFACE);

      // Blue micro left accent on odd rows
      if (!even) doc.rect(ML, Y, 3, ROW_H).fill(BLUE_LINE);

      const TY = Y + 9;
      doc.fillColor(INK_MID).font('Helvetica').fontSize(9.5)
         .text(desc, TDESC, TY, { width: TDESC_W, lineBreak: false });
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9)
         .text(String(qty), TQTY - TQTY_W, TY, { width: TQTY_W, align: 'right' });
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9)
         .text(fmtMoney(rate), TRATE - TRATE_W, TY, { width: TRATE_W, align: 'right' });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5)
         .text(fmtMoney(amount), TAMT - TAMT_W, TY, { width: TAMT_W, align: 'right' });

      // Row separator
      doc.moveTo(ML, Y + ROW_H).lineTo(MR, Y + ROW_H)
         .strokeColor(BORDER).lineWidth(0.4).stroke();

      Y += ROW_H;
    });

    // Table bottom rule — blue
    doc.rect(ML, Y, CW, 2).fill(BLUE);
    Y += 2;

    // ── 5. TOTALS CARD ────────────────────────────────────────
    Y += 18;
    const TC_W  = 230;
    const TC_X  = MR - TC_W;
    const TC_PX = TC_X + 16;
    const TC_VX = MR;
    const TC_VW = 90;

    // Count rows to size card
    let totRows = 1;
    if (taxRate > 0)  totRows++;
    if (discount > 0) totRows++;
    const CARD_H = totRows * 20 + 16;

    // Totals card background
    doc.rect(TC_X, Y - 8, TC_W, CARD_H).fill(SURFACE);
    doc.rect(TC_X, Y - 8, 1, CARD_H).fill(BORDER);

    // Subtotal
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9)
       .text('Subtotal', TC_PX, Y);
    doc.fillColor(INK_MID).font('Helvetica').fontSize(9)
       .text(fmtMoney(subtotal), TC_VX - TC_VW, Y, { width: TC_VW, align: 'right' });
    Y += 20;

    if (taxRate > 0) {
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9)
         .text(`Tax (${taxRate}%)`, TC_PX, Y);
      doc.fillColor(INK_MID).font('Helvetica').fontSize(9)
         .text(fmtMoney(taxAmt), TC_VX - TC_VW, Y, { width: TC_VW, align: 'right' });
      Y += 20;
    }

    if (discount > 0) {
      doc.fillColor(RED).font('Helvetica').fontSize(9)
         .text('Discount', TC_PX, Y);
      doc.fillColor(RED).font('Helvetica').fontSize(9)
         .text('– ' + fmtMoney(discount), TC_VX - TC_VW, Y, { width: TC_VW, align: 'right' });
      Y += 20;
    }

    Y += 8;

    // TOTAL DUE band
    const TB_H = 42;
    doc.rect(TC_X, Y, TC_W, TB_H).fill(BLUE);
    // Shine
    doc.save();
    doc.rect(TC_X, Y, TC_W, 14).fillOpacity(0.14).fill(WHITE);
    doc.restore();
    // Left accent
    doc.rect(TC_X, Y, 4, TB_H).fill(NAVY);

    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(9)
       .text('TOTAL DUE', TC_PX + 4, Y + 14, { characterSpacing: 0.8 });
    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(14)
       .text(fmtMoney(total), TC_VX - TC_VW, Y + 11, { width: TC_VW, align: 'right' });

    Y += TB_H + 32;

    // ── 6. NOTES ─────────────────────────────────────────────
    if (invoice.notes && invoice.notes.trim()) {
      const NW   = CW * 0.64;
      const NOTE = invoice.notes.trim();
      const NH   = Math.max(50, doc.heightOfString(NOTE, { width: NW - 28, fontSize: 9, lineGap: 3 }) + 36);

      // Label row
      doc.rect(ML, Y, NW, 22).fill(SURFACE);
      doc.rect(ML, Y, 3, 22).fill(BLUE);
      doc.fillColor(INK_SOFT).font('Helvetica-Bold').fontSize(7)
         .text('NOTES / PAYMENT TERMS', ML + 12, Y + 8, { characterSpacing: 1 });

      // Body
      doc.rect(ML, Y + 22, NW, NH - 22).fill(WHITE);
      doc.rect(ML, Y, NW, NH).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fillColor(INK_MID).font('Helvetica').fontSize(9)
         .text(NOTE, ML + 12, Y + 30, { width: NW - 24, lineGap: 3 });

      Y += NH + 24;
    }

    // ── 7. FOOTER ─────────────────────────────────────────────
    const FY = PH - 46;
    doc.rect(0, FY, PW, 46).fill(INK);
    doc.rect(0, FY, PW, 3).fill(BLUE);

    doc.fillColor('rgba(255,255,255,0.28)').font('Helvetica').fontSize(8)
       .text('Generated by InvoiceKit', ML, FY + 12, { width: CW, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.13)').font('Helvetica').fontSize(7)
       .text('invoicekit.onrender.com  ·  No data stored  ·  Private & Secure', ML, FY + 25, { width: CW, align: 'center' });

    doc.end();

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
