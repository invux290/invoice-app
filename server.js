require('dotenv').config();

const express = require("express");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");

const app = express();

let invoiceCounter = 1;

app.use(bodyParser.json());
app.use(express.static("public"));

app.post("/generate", (req, res) => {
  
  const invoiceNumber = `INV-${String(invoiceCounter++).padStart(4, '0')}`;
  const { name, client, description, amount } = req.body;

  const doc = new PDFDocument();

  res.setHeader("Content-Disposition", "attachment; filename=invoice.pdf");
  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(res);

  doc.fontSize(25).text("Invoice", { align: "center" });
  doc.moveDown();
  doc.text(`Invoice Number: ${invoiceNumber}`);
  doc.moveDown();

  doc.text(`From: ${name}`);
  doc.text(`Client: ${client}`);
  doc.text(`Service: ${description}`);
  doc.text(`Amount: $${amount}`);

  doc.end();
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});