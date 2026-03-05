require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.get('/', (req, res) => res.sendFile(require('path').join(__dirname, 'public/landing.html')));
app.use(express.static(path.join(__dirname, 'public')));

let invoiceCounter = parseInt(process.env.INVOICE_COUNTER || '1');

app.post('/api/invoice', (req, res) => {
  try {

    const body = req.body || {};
    const logo = body.logo;
    const sender = body.sender || {};
    const client = body.client || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const invoice = body.invoice || {};

    if (!sender.name) {
      return res.status(400).json({ error: 'Sender name is required.' });
    }

    if (!client.name) {
      return res.status(400).json({ error: 'Client name is required.' });
    }

    if (!items.length) {
      return res.status(400).json({ error: 'At least one line item is required.' });
    }

    const currency = invoice.currency || 'USD';

    const symbols = {
      USD: '$',
      EUR: '€',
      GBP: '£',
      INR: '₹',
      CAD: 'CA$',
      AUD: 'A$'
    };

    const sym = symbols[currency] || currency + ' ';

    const money = n => sym + Number(n || 0).toFixed(2);

    const date = d => {
      if (!d) return '--';
      const dt = new Date(d);
      if (isNaN(dt)) return d;
      return dt.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    };

    const subtotal = items.reduce((sum, item) => {
      const qty = Number(item.qty || 0);
      const rate = Number(item.rate || 0);
      return sum + qty * rate;
    }, 0);

    const taxRate = Number(invoice.taxRate || 0);
    const discount = Number(invoice.discount || 0);

    const taxAmount = subtotal * (taxRate / 100);
    const total = Math.max(0, subtotal + taxAmount - discount);

    const invNumber =
      invoice.number ||
      'INV-' + String(invoiceCounter++).padStart(4, '0');

    const doc = new PDFDocument({
      size: 'A4',
      margin: 50
    });

    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));

    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="invoice-${invNumber}.pdf"`
      );
      res.setHeader('Content-Length', buffer.length);

      res.end(buffer);
    });

    const W = doc.page.width;
    const M = 50;

    const BRAND = '#4f46e5';
    const DARK = '#111827';
    const GRAY = '#6b7280';
    const LIGHT = '#f9fafb';
    const BORDER = '#e5e7eb';

    /* HEADER */

    doc.rect(0, 0, W, 90).fill(BRAND);

    doc.fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(26)
      .text('INVOICE', M, 25);
   
    // ── Logo Rendering ─────────────────────────

if (body.logo && typeof body.logo === 'string' && body.logo.includes('base64,')) {
  try {
    const base64Data = body.logo.split('base64,')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const logoWidth = 120;
    const logoHeight = 60;

    const logoX = W - M - logoWidth;
    const logoY = 15;

    doc.image(imageBuffer, logoX, logoY, {
      fit: [logoWidth, logoHeight],
      align: 'right',
      valign: 'center'
    });

  } catch (err) {
    console.log("Logo failed to render:", err.message);
  }
}

    doc.fontSize(11)
      .font('Helvetica')
      .text('#' + invNumber, M, 55);

    doc.fontSize(9)
      .text(`Issued: ${date(invoice.date)}`, W - 200, 30, {
        width: 150,
        align: 'right'
      });

    doc.text(`Due: ${date(invoice.due)}`, W - 200, 46, {
      width: 150,
      align: 'right'
    });

    /* FROM / TO */

    const blockY = 110;

    doc.fillColor(GRAY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('FROM', M, blockY)
      .text('BILL TO', M + 260, blockY);

    doc.fillColor(DARK)
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(sender.name, M, blockY + 14)
      .text(client.name, M + 260, blockY + 14);

    doc.font('Helvetica')
      .fontSize(9)
      .fillColor(GRAY);

    let sy = blockY + 30;
    let cy = blockY + 30;

    if (sender.email) {
      doc.text(sender.email, M, sy);
      sy += 13;
    }

    if (sender.phone) {
      doc.text(sender.phone, M, sy);
      sy += 13;
    }

    if (sender.address) {
      doc.text(sender.address, M, sy);
    }

    if (client.company) {
      doc.text(client.company, M + 260, cy);
      cy += 13;
    }

    if (client.email) {
      doc.text(client.email, M + 260, cy);
      cy += 13;
    }

    if (client.address) {
      doc.text(client.address, M + 260, cy);
    }

    const dividerY = Math.max(sy, cy) + 20;

    doc.moveTo(M, dividerY)
      .lineTo(W - M, dividerY)
      .strokeColor(BORDER)
      .stroke();

    /* TABLE */

    const tableTop = dividerY + 15;

    const colDesc = M;
    const colQty = M + 295;
    const colRate = M + 355;
    const colAmount = W - M - 60;

    doc.rect(M, tableTop, W - M * 2, 22).fill(LIGHT);

    doc.fillColor(GRAY)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('DESCRIPTION', colDesc + 6, tableTop + 7)
      .text('QTY', colQty, tableTop + 7, { width: 55, align: 'right' })
      .text('RATE', colRate, tableTop + 7, { width: 65, align: 'right' })
      .text('AMOUNT', colAmount, tableTop + 7, {
        width: 60,
        align: 'right'
      });

    let y = tableTop + 30;

    items.forEach((item, index) => {
      const qty = Number(item.qty || 0);
      const rate = Number(item.rate || 0);
      const amount = qty * rate;

      const desc =
        item.desc ||
        item.description ||
        item.name ||
        'Item';

      if (index % 2) {
        doc.rect(M, y - 4, W - M * 2, 22).fill('#fafafa');
      }

      doc.fillColor(DARK)
        .font('Helvetica')
        .fontSize(9)
        .text(desc, colDesc + 6, y, { width: 240 });

      doc.text(String(qty), colQty, y, {
        width: 55,
        align: 'right'
      });

      doc.text(money(rate), colRate, y, {
        width: 65,
        align: 'right'
      });

      doc.font('Helvetica-Bold')
        .text(money(amount), colAmount, y, {
          width: 60,
          align: 'right'
        });

      doc.moveTo(M, y + 16)
        .lineTo(W - M, y + 16)
        .strokeColor('#f3f4f6')
        .stroke();

      y += 24;
    });

    /* TOTALS */

    y += 10;

    doc.moveTo(M + 280, y)
      .lineTo(W - M, y)
      .strokeColor(BORDER)
      .stroke();

    y += 10;

    const labelX = M + 290;
    const valueX = W - M - 60;

    const row = (label, value, color) => {
      doc.fillColor(color || GRAY)
        .font('Helvetica')
        .fontSize(9)
        .text(label, labelX, y);

      doc.fillColor(color || DARK)
        .font(color ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, valueX, y, {
          width: 60,
          align: 'right'
        });

      y += 18;
    };

    row('Subtotal', money(subtotal));

    if (taxRate > 0) {
      row(`Tax (${taxRate}%)`, money(taxAmount));
    }

    if (discount > 0) {
      row('Discount', '- ' + money(discount), '#ef4444');
    }

    y += 4;

    doc.rect(M + 275, y, W - M - (M + 275), 28).fill(BRAND);

    doc.fillColor('white')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('TOTAL DUE', labelX, y + 9)
      .text(money(total), valueX, y + 9, {
        width: 60,
        align: 'right'
      });

    y += 38;

    /* NOTES */

    if (invoice.notes) {
      y += 10;

      doc.moveTo(M, y)
        .lineTo(W - M, y)
        .strokeColor(BORDER)
        .stroke();

      y += 12;

      doc.fillColor(GRAY)
        .font('Helvetica-Bold')
        .fontSize(8)
        .text('NOTES / PAYMENT TERMS', M, y);

      y += 13;

      doc.fillColor(DARK)
        .font('Helvetica')
        .fontSize(9)
        .text(invoice.notes, M, y, {
          width: W - M * 2
        });
    }

    /* FOOTER */

    doc.fillColor('#9ca3af')
      .fontSize(8)
      .text(
        'Generated by InvoiceKit',
        M,
        doc.page.height - 40,
        {
          width: W - M * 2,
          align: 'center'
        }
      );

    doc.end();

  } catch (err) {

    console.error('PDF error:', err);

    if (!res.headersSent) {
      res.status(500).json({
        error: 'PDF generation failed: ' + err.message
      });
    }
  }
});

const PORT = process.env.PORT || 3000;

app.get('/app', (req, res) => res.sendFile(require('path').join(__dirname, 'public/index.html')));

app.listen(PORT, () => {
  console.log('InvoiceKit running on port ' + PORT);
});

