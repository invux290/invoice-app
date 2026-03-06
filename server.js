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
    const fmtMoney = n => sym + parseFloat(n || 0).toLocaleString('en-IN', { minimumFractionDigits:2, maximumFractionDigits:2 });
    const fmtDate  = d => {
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

    // ── Dimensions & palette ─────────────────────────────────
    const W = doc.page.width;   // 595.28
    const H = doc.page.height;  // 841.89
    const PAD = 48;

    const C = {
      blue:       '#1A56DB',
      blueDark:   '#1447B7',
      blueMid:    '#2563EB',
      blueLight:  '#EFF6FF',
      blueBorder: '#DBEAFE',
      ink:        '#0B1120',
      inkMid:     '#2D3748',
      inkSoft:    '#64748B',
      inkFaint:   '#94A3B8',
      border:     '#E8EDF5',
      surface:    '#F7F9FC',
      white:      '#FFFFFF',
      success:    '#10B981',
    };

    // ── Helper: rounded rect ─────────────────────────────────
    const rRect = (x, y, w, h, r, fill) => {
      doc.roundedRect(x, y, w, h, r).fill(fill);
    };

    // ═══════════════════════════════════════════════════════════
    // BACKGROUND
    // ═══════════════════════════════════════════════════════════
    doc.rect(0, 0, W, H).fill(C.white);

    // Left accent bar
    doc.rect(0, 0, 6, H).fill(C.blue);

    // Subtle top-right geometric accent
    doc.save();
    doc.circle(W + 40, -40, 150).fill(C.blueLight);
    doc.restore();

    // Very subtle grid lines (faint)
    doc.save();
    doc.lineWidth(0.3).strokeColor('#F0F4FC');
    for (let x = PAD; x < W - PAD; x += 40) {
      doc.moveTo(x, 0).lineTo(x, H).stroke();
    }
    for (let y = 0; y < H; y += 40) {
      doc.moveTo(0, y).lineTo(W, y).stroke();
    }
    doc.restore();

    // ═══════════════════════════════════════════════════════════
    // HEADER SECTION
    // ═══════════════════════════════════════════════════════════
    const HBAR_H = 120;

    // Main header bg
    doc.rect(6, 0, W - 6, HBAR_H).fill(C.blueDark);

    // Decorative orb top-right
    doc.save();
    doc.circle(W - 20, 0, 110).fillOpacity(0.12).fill(C.white);
    doc.circle(W - 60, HBAR_H - 10, 70).fillOpacity(0.07).fill(C.white);
    doc.restore();
    doc.fillOpacity(1);

    // "INVOICE" big text
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(30)
       .text('INVOICE', PAD, 28, { characterSpacing: 3 });

    // Invoice number - mono style pill
    const numLabel = '#' + invNumber;
    doc.fillColor('rgba(255,255,255,0.55)').font('Helvetica').fontSize(10)
       .text(numLabel, PAD, 66, { characterSpacing: 0.5 });

    // Right side — dates
    const datesX = W - PAD - 180;
    doc.fillColor('rgba(255,255,255,0.5)').font('Helvetica').fontSize(8)
       .text('ISSUED', datesX, 30, { width: 180, align: 'right', characterSpacing: 1 });
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(11)
       .text(fmtDate(invoice.date), datesX, 42, { width: 180, align: 'right' });

    doc.fillColor('rgba(255,255,255,0.5)').font('Helvetica').fontSize(8)
       .text('DUE DATE', datesX, 66, { width: 180, align: 'right', characterSpacing: 1 });
    doc.fillColor('rgba(255,255,255,0.9)').font('Helvetica-Bold').fontSize(11)
       .text(fmtDate(invoice.due), datesX, 78, { width: 180, align: 'right' });

    // ═══════════════════════════════════════════════════════════
    // FROM / BILL TO SECTION
    // ═══════════════════════════════════════════════════════════
    let curY = HBAR_H + 28;

    // From card
    const cardPad = 16;
    const cardW   = (W - PAD * 2 - 6 - 20) / 2;
    const fromX   = PAD + 6;
    const toX     = fromX + cardW + 20;

    // FROM box
    rRect(fromX, curY, cardW, 8, 3, C.blue);  // color top strip
    doc.rect(fromX, curY + 8, cardW, 85).fill(C.surface);

    // TO box
    rRect(toX, curY, cardW, 8, 3, C.blueLight);
    doc.rect(toX, curY + 8, cardW, 85).fill(C.white);

    // FROM label + content
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7)
       .text('FROM', fromX + cardPad, curY + 1, { characterSpacing: 1.5 });

    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12)
       .text(sender.name || '', fromX + cardPad, curY + 16, { width: cardW - cardPad * 2 });

    let fromDetailY = curY + 33;
    const fromDetails = [sender.email, sender.phone, sender.address].filter(Boolean);
    doc.fillColor(C.inkSoft).font('Helvetica').fontSize(8.5);
    fromDetails.forEach(line => {
      doc.text(line, fromX + cardPad, fromDetailY, { width: cardW - cardPad * 2 });
      fromDetailY += 13;
    });

    // BILL TO label + content
    doc.fillColor(C.blue).font('Helvetica-Bold').fontSize(7)
       .text('BILL TO', toX + cardPad, curY + 1, { characterSpacing: 1.5 });

    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(12)
       .text(client.name || '', toX + cardPad, curY + 16, { width: cardW - cardPad * 2 });

    let toDetailY = curY + 33;
    const toDetails = [client.company, client.email, client.address].filter(Boolean);
    doc.fillColor(C.inkSoft).font('Helvetica').fontSize(8.5);
    toDetails.forEach(line => {
      doc.text(line, toX + cardPad, toDetailY, { width: cardW - cardPad * 2 });
      toDetailY += 13;
    });

    curY += 105;

    // ═══════════════════════════════════════════════════════════
    // LINE ITEMS TABLE
    // ═══════════════════════════════════════════════════════════
    curY += 16;
    const tableX = PAD + 6;
    const tableW = W - PAD * 2 - 6;

    // Column positions
    const colDesc = tableX + 12;
    const colQty  = tableX + tableW - 215;
    const colRate = tableX + tableW - 155;
    const colAmt  = tableX + tableW - 80;
    const colAmtW = 68;

    // Table header row
    doc.rect(tableX, curY, tableW, 26).fill(C.blue);
    // Blue left accent on header
    doc.rect(tableX, curY, 4, 26).fill(C.blueMid);

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7.5);
    doc.text('DESCRIPTION',    colDesc, curY + 9, { width: 200, characterSpacing: 0.8 });
    doc.text('QTY',            colQty,  curY + 9, { width: 55, align: 'right', characterSpacing: 0.8 });
    doc.text('RATE',           colRate, curY + 9, { width: 65, align: 'right', characterSpacing: 0.8 });
    doc.text('AMOUNT',         colAmt,  curY + 9, { width: colAmtW, align: 'right', characterSpacing: 0.8 });

    curY += 26;

    // Item rows
    items.forEach((item, idx) => {
      const qty    = parseFloat(item.qty  || 0);
      const rate   = parseFloat(item.rate || 0);
      const amount = qty * rate;
      const desc   = typeof item.desc === 'string' ? item.desc : (item.description || item.name || '');

      const rowH = 28;
      const isEven = idx % 2 === 0;

      // Row bg
      doc.rect(tableX, curY, tableW, rowH).fill(isEven ? C.white : C.surface);

      // Thin left accent on alternating rows
      if (!isEven) {
        doc.rect(tableX, curY, 3, rowH).fill(C.blueBorder);
      }

      // Row bottom border
      doc.moveTo(tableX, curY + rowH).lineTo(tableX + tableW, curY + rowH)
         .strokeColor(C.border).lineWidth(0.5).stroke();

      const rowTextY = curY + 10;
      doc.fillColor(C.ink).font('Helvetica').fontSize(9.5)
         .text(desc, colDesc, rowTextY, { width: 200 });
      doc.fillColor(C.inkSoft).font('Helvetica').fontSize(9)
         .text(String(qty), colQty, rowTextY, { width: 55, align: 'right' });
      doc.fillColor(C.inkSoft).font('Helvetica').fontSize(9)
         .text(fmtMoney(rate), colRate, rowTextY, { width: 65, align: 'right' });
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(9.5)
         .text(fmtMoney(amount), colAmt, rowTextY, { width: colAmtW, align: 'right' });

      curY += rowH;
    });

    // Table bottom border
    doc.moveTo(tableX, curY).lineTo(tableX + tableW, curY)
       .strokeColor(C.blue).lineWidth(1.5).stroke();

    // ═══════════════════════════════════════════════════════════
    // TOTALS SECTION
    // ═══════════════════════════════════════════════════════════
    curY += 20;

    const totBoxX = tableX + tableW - 220;
    const totBoxW = 220;
    const totLX   = totBoxX + 12;
    const totVX   = totBoxX + totBoxW - 12;

    // Totals background card
    doc.rect(totBoxX, curY - 8, totBoxW, taxRate > 0 ? (discount > 0 ? 90 : 75) : (discount > 0 ? 75 : 60)).fill(C.surface);

    const totLine = (label, value, bold) => {
      doc.fillColor(C.inkSoft).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
         .text(label, totLX, curY, { width: 90 });
      doc.fillColor(bold ? C.ink : C.inkMid).font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
         .text(value, totVX - 55, curY, { width: 55, align: 'right' });
      curY += 18;
    };

    totLine('Subtotal', fmtMoney(subtotal));
    if (taxRate > 0)  totLine(`Tax (${taxRate}%)`, fmtMoney(taxAmount));
    if (discount > 0) {
      doc.fillColor('#EF4444').font('Helvetica').fontSize(9)
         .text('Discount', totLX, curY, { width: 90 });
      doc.fillColor('#EF4444').font('Helvetica').fontSize(9)
         .text('- ' + fmtMoney(discount), totVX - 55, curY, { width: 55, align: 'right' });
      curY += 18;
    }

    curY += 6;

    // TOTAL DUE — premium band
    const totalH = 38;
    // Main band
    doc.rect(totBoxX, curY, totBoxW, totalH).fill(C.blue);
    // Shine effect (lighter strip at top)
    doc.save();
    doc.rect(totBoxX, curY, totBoxW, 12).fillOpacity(0.15).fill(C.white);
    doc.restore();
    doc.fillOpacity(1);
    // Small left accent
    doc.rect(totBoxX, curY, 4, totalH).fill(C.blueMid);

    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9.5)
       .text('TOTAL DUE', totLX + 4, curY + 12, { characterSpacing: 0.5 });
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(14)
       .text(fmtMoney(total), totVX - 80, curY + 11, { width: 80, align: 'right' });

    curY += totalH + 28;

    // ═══════════════════════════════════════════════════════════
    // NOTES SECTION
    // ═══════════════════════════════════════════════════════════
    if (invoice.notes && invoice.notes.trim()) {
      const notesX = PAD + 6;
      const notesW = (W - PAD * 2 - 6) * 0.6;

      // Notes card
      doc.rect(notesX, curY, notesW, 10).fill(C.blue);
      doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7)
         .text('NOTES / PAYMENT TERMS', notesX + 10, curY + 2, { characterSpacing: 1 });

      doc.rect(notesX, curY + 10, notesW, 55).fill(C.surface);
      doc.fillColor(C.inkMid).font('Helvetica').fontSize(9)
         .text(invoice.notes.trim(), notesX + 10, curY + 20, { width: notesW - 20, lineGap: 3 });

      curY += 75;
    }

    // ═══════════════════════════════════════════════════════════
    // FOOTER
    // ═══════════════════════════════════════════════════════════
    const footerY = H - 42;

    doc.rect(6, footerY, W - 6, 42).fill(C.ink);
    doc.rect(6, footerY, 4, 42).fill(C.blue);

    // Footer text
    doc.fillColor('rgba(255,255,255,0.35)').font('Helvetica').fontSize(8)
       .text('Generated by InvoiceKit', PAD, footerY + 10, { width: W - PAD * 2, align: 'center' });
    doc.fillColor('rgba(255,255,255,0.18)').font('Helvetica').fontSize(7)
       .text('invoicekit.onrender.com  ·  No data stored  ·  Your privacy is protected', PAD, footerY + 23, { width: W - PAD * 2, align: 'center' });

    doc.end();

  } catch (err) {
    console.error('PDF error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'PDF generation failed: ' + err.message });
  }
});

app.get('/',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'landing.html')));
app.get('/app',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/app.html',(req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`InvoiceKit running on port ${PORT}`));
