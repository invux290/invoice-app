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

    const currency  = invoice.currency || 'USD';
    const symbols   = { USD:'$', EUR:'€', GBP:'£', INR:'₹', CAD:'CA$', AUD:'A$' };
    const sym       = symbols[currency] || (currency + ' ');
    const fmtMoney  = n => sym + Number(parseFloat(n || 0).toFixed(2)).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const fmtDate   = d => {
      if (!d) return '—';
      const dt = new Date(d);
      return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    };

    const subtotal  = items.reduce((s, i) => s + parseFloat(i.qty||0) * parseFloat(i.rate||0), 0);
    const taxRate   = parseFloat(invoice.taxRate  || 0);
    const discount  = parseFloat(invoice.discount || 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total     = Math.max(0, subtotal + taxAmount - discount);
    const invNumber = invoice.number || ('INV-' + String(invoiceCounter++).padStart(4,'0'));

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

    const W   = doc.page.width;   // 595.28
    const H   = doc.page.height;  // 841.89
    const ML  = 52;  // left margin
    const MR  = W - 52; // right edge

    // ── Palette ───────────────────────────────────────────────
    const BLUE       = '#1A56DB';
    const BLUE_DARK  = '#1447B7';
    const BLUE_LIGHT = '#EFF6FF';
    const BLUE_MID   = '#2563EB';
    const INK        = '#0F172A';
    const INK_MID    = '#334155';
    const INK_SOFT   = '#64748B';
    const INK_FAINT  = '#94A3B8';
    const BORDER     = '#E2E8F0';
    const SURFACE    = '#F8FAFC';
    const WHITE      = '#FFFFFF';

    // ── Clean white background ────────────────────────────────
    doc.rect(0, 0, W, H).fill(WHITE);

    // ══════════════════════════════════════════════════════════
    // HEADER — elegant two-tone
    // ══════════════════════════════════════════════════════════
    const HEADER_H = 140;

    // Deep navy top block
    doc.rect(0, 0, W, HEADER_H).fill(BLUE_DARK);

    // Accent stripe at very bottom of header
    doc.rect(0, HEADER_H - 4, W, 4).fill(BLUE);

    // Soft large circle decorations (top right)
    doc.save();
    doc.opacity(0.06);
    doc.circle(W - 30, -20, 160).fill(WHITE);
    doc.opacity(0.04);
    doc.circle(W - 100, HEADER_H + 20, 100).fill(WHITE);
    doc.restore();

    // "INVOICE" — large, tracked
    doc.fillColor(WHITE)
       .font('Helvetica-Bold')
       .fontSize(32)
       .text('INVOICE', ML, 30, { characterSpacing: 2 });

    // Invoice number — mono feel
    doc.fillColor('rgba(255,255,255,0.45)')
       .font('Helvetica')
       .fontSize(10)
       .text(invNumber, ML, 72, { characterSpacing: 1 });

    // Dates right side
    const dR = MR;
    // Issued
    doc.fillColor('rgba(255,255,255,0.4)')
       .font('Helvetica')
       .fontSize(7.5)
       .text('ISSUED', ML, 36, { width: dR - ML, align: 'right', characterSpacing: 1.5 });
    doc.fillColor(WHITE)
       .font('Helvetica-Bold')
       .fontSize(12)
       .text(fmtDate(invoice.date), ML, 47, { width: dR - ML, align: 'right' });

    // Due
    doc.fillColor('rgba(255,255,255,0.4)')
       .font('Helvetica')
       .fontSize(7.5)
       .text('DUE DATE', ML, 76, { width: dR - ML, align: 'right', characterSpacing: 1.5 });
    doc.fillColor('rgba(255,255,255,0.95)')
       .font('Helvetica-Bold')
       .fontSize(12)
       .text(fmtDate(invoice.due), ML, 87, { width: dR - ML, align: 'right' });

    // ══════════════════════════════════════════════════════════
    // FROM / BILL TO
    // ══════════════════════════════════════════════════════════
    let Y = HEADER_H + 36;
    const halfW = (W - ML - (W - MR) - 32) / 2;
    const fromX = ML;
    const toX   = ML + halfW + 32;

    // FROM
    // Section label line accent
    doc.rect(fromX, Y, 28, 2).fill(BLUE);
    doc.fillColor(BLUE)
       .font('Helvetica-Bold')
       .fontSize(7)
       .text('FROM', fromX + 32, Y - 2, { characterSpacing: 1.5 });

    Y += 10;
    doc.fillColor(INK)
       .font('Helvetica-Bold')
       .fontSize(13)
       .text(sender.name || '', fromX, Y, { width: halfW });

    let fromY = Y + 20;
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9);
    [sender.email, sender.phone, sender.address].filter(Boolean).forEach(line => {
      doc.text(line, fromX, fromY, { width: halfW }); fromY += 14;
    });

    // BILL TO
    const toTop = HEADER_H + 36;
    doc.rect(toX, toTop, 28, 2).fill(INK_FAINT);
    doc.fillColor(INK_SOFT)
       .font('Helvetica-Bold')
       .fontSize(7)
       .text('BILL TO', toX + 32, toTop - 2, { characterSpacing: 1.5 });

    doc.fillColor(INK)
       .font('Helvetica-Bold')
       .fontSize(13)
       .text(client.name || '', toX, toTop + 10, { width: halfW });

    let toY = toTop + 30;
    doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9);
    [client.company, client.email, client.address].filter(Boolean).forEach(line => {
      doc.text(line, toX, toY, { width: halfW }); toY += 14;
    });

    Y = Math.max(fromY, toY) + 28;

    // Divider line
    doc.moveTo(ML, Y).lineTo(MR, Y).strokeColor(BORDER).lineWidth(1).stroke();
    Y += 28;

    // ══════════════════════════════════════════════════════════
    // ITEMS TABLE
    // ══════════════════════════════════════════════════════════
    const TW       = MR - ML;
    const ROW_H    = 30;
    const HEAD_H   = 28;

    // Column layout — description gets the most space
    const C_DESC  = ML;
    const C_QTY   = ML + TW - 230;
    const C_RATE  = ML + TW - 160;
    const C_AMT   = ML + TW - 80;
    const W_DESC  = TW - 240;
    const W_QTY   = 60;
    const W_RATE  = 70;
    const W_AMT   = 80;

    // Header row
    doc.rect(ML, Y, TW, HEAD_H).fill(INK);

    doc.fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5);
    doc.text('DESCRIPTION', C_DESC + 10, Y + 10, { width: W_DESC, characterSpacing: 0.8 });
    doc.text('QTY',  C_QTY,  Y + 10, { width: W_QTY,  align: 'center', characterSpacing: 0.8 });
    doc.text('RATE', C_RATE, Y + 10, { width: W_RATE, align: 'right',  characterSpacing: 0.8 });
    doc.text('AMOUNT', C_AMT, Y + 10, { width: W_AMT, align: 'right',  characterSpacing: 0.8 });

    Y += HEAD_H;

    items.forEach((item, idx) => {
      const qty    = parseFloat(item.qty  || 0);
      const rate   = parseFloat(item.rate || 0);
      const amount = qty * rate;
      const desc   = String(item.desc || item.description || item.name || '');
      const even   = idx % 2 === 0;

      doc.rect(ML, Y, TW, ROW_H).fill(even ? WHITE : SURFACE);

      // Subtle left accent on even rows
      if (!even) doc.rect(ML, Y, 3, ROW_H).fill(BLUE_LIGHT);

      const rY = Y + 10;
      doc.fillColor(INK_MID).font('Helvetica').fontSize(9.5)
         .text(desc, C_DESC + 10, rY, { width: W_DESC, lineBreak: false });
      doc.fillColor(INK_SOFT).font('Helvetica').fontSize(9)
         .text(String(qty),     C_QTY,  rY, { width: W_QTY,  align: 'center' })
         .text(fmtMoney(rate),  C_RATE, rY, { width: W_RATE, align: 'right'  });
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(9.5)
         .text(fmtMoney(amount), C_AMT, rY, { width: W_AMT, align: 'right'  });

      // Row separator
      doc.moveTo(ML, Y + ROW_H).lineTo(MR, Y + ROW_H)
         .strokeColor(BORDER).lineWidth(0.4).stroke();

      Y += ROW_H;
    });

    // Bottom rule of table
    doc.rect(ML, Y, TW, 2).fill(BLUE);
    Y += 2;

    // ══════════════════════════════════════════════════════════
    // TOTALS
    // ══════════════════════════════════════════════════════════
    Y += 20;
    const TOT_X  = MR - 240;
    const TOT_W  = 240;
    const TOT_LX = TOT_X + 16;
    const TOT_VX = MR - 16;
    const TOT_VW = 80;

    const drawTotRow = (label, value, labelColor, valueColor, bold) => {
      doc.fillColor(labelColor || INK_SOFT)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(9)
         .text(label, TOT_LX, Y, { width: TOT_W - TOT_VW - 24 });
      doc.fillColor(valueColor || INK_MID)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fontSize(9)
         .text(value, TOT_VX - TOT_VW, Y, { width: TOT_VW, align: 'right' });
      Y += 17;
    };

    // Light bg for totals area
    doc.rect(TOT_X, Y - 6, TOT_W, taxRate > 0 ? (discount > 0 ? 72 : 54) : (discount > 0 ? 54 : 36))
       .fill(SURFACE);

    drawTotRow('Subtotal', fmtMoney(subtotal));
    if (taxRate > 0)  drawTotRow(`Tax  ${taxRate}%`, fmtMoney(taxAmount));
    if (discount > 0) drawTotRow('Discount', '- ' + fmtMoney(discount), '#DC2626', '#DC2626');

    Y += 8;

    // TOTAL DUE — premium pill
    const TOT_FINAL_H = 44;
    // Outer shadow effect
    doc.save();
    doc.opacity(0.12);
    doc.rect(TOT_X + 2, Y + 2, TOT_W, TOT_FINAL_H).fill(BLUE);
    doc.restore();

    // Main band gradient sim (two overlapping rects)
    doc.rect(TOT_X, Y, TOT_W, TOT_FINAL_H).fill(BLUE);
    doc.save();
    doc.opacity(0.18);
    doc.rect(TOT_X, Y, TOT_W, 16).fill(WHITE);
    doc.restore();
    // Accent strip left
    doc.rect(TOT_X, Y, 4, TOT_FINAL_H).fill(BLUE_MID);

    doc.fillColor(WHITE)
       .font('Helvetica-Bold')
       .fontSize(10)
       .text('TOTAL DUE', TOT_LX + 4, Y + 14, { characterSpacing: 0.5 });
    doc.fillColor(WHITE)
       .font('Helvetica-Bold')
       .fontSize(14)
       .text(fmtMoney(total), TOT_VX - TOT_VW, Y + 12, { width: TOT_VW, align: 'right' });

    Y += TOT_FINAL_H + 32;

    // ══════════════════════════════════════════════════════════
    // NOTES
    // ══════════════════════════════════════════════════════════
    if (invoice.notes && invoice.notes.trim()) {
      const NW = (MR - ML) * 0.62;
      // Header strip
      doc.rect(ML, Y, NW, 22).fill(SURFACE);
      doc.rect(ML, Y, 3, 22).fill(BLUE);
      doc.fillColor(INK_SOFT)
         .font('Helvetica-Bold')
         .fontSize(7.5)
         .text('NOTES & PAYMENT TERMS', ML + 12, Y + 8, { characterSpacing: 0.8 });

      Y += 22;
      const noteLines = invoice.notes.trim();
      const noteH = Math.max(45, doc.heightOfString(noteLines, { width: NW - 24, fontSize: 9 }) + 24);
      doc.rect(ML, Y, NW, noteH).fill(WHITE);
      doc.rect(ML, Y, NW, noteH).strokeColor(BORDER).lineWidth(0.5).stroke();
      doc.fillColor(INK_MID)
         .font('Helvetica')
         .fontSize(9)
         .text(noteLines, ML + 12, Y + 12, { width: NW - 24, lineGap: 4 });
      Y += noteH + 20;
    }

    // ══════════════════════════════════════════════════════════
    // FOOTER
    // ══════════════════════════════════════════════════════════
    const FY = H - 50;
    doc.rect(0, FY, W, 50).fill(INK);
    // Blue accent left
    doc.rect(0, FY, W, 3).fill(BLUE);

    doc.fillColor('rgba(255,255,255,0.3)')
       .font('Helvetica')
       .fontSize(8)
       .text('Generated by InvoiceKit', ML, FY + 14, { width: MR - ML, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.14)')
       .font('Helvetica')
       .fontSize(7)
       .text('invoicekit.onrender.com  ·  All data processed locally  ·  No information stored', ML, FY + 28, { width: MR - ML, align: 'center' });

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
