@echo off
echo ===============================
echo Invoice SaaS Auto Builder
echo ===============================

echo Installing dependencies...
npm install express pdfkit body-parser cors dotenv nodemon

echo Creating folders...
mkdir public

echo Creating ENV file...
echo PORT=3000 > .env

echo Creating gitignore...
echo node_modules/ > .gitignore
echo .env >> .gitignore

echo Creating server.js...

(
echo require('dotenv').config();
echo const express = require("express");
echo const PDFDocument = require("pdfkit");
echo const bodyParser = require("body-parser");
echo.
echo const app = express();
echo.
echo let invoiceCounter = 1;
echo.
echo app.use(bodyParser.json());
echo app.use(express.static("public"));
echo.
echo app.post("/generate", (req, res) =^> ^{
echo.
echo const invoiceNumber = `INV-${String(invoiceCounter++).padStart(4,'0')}`;
echo const { name, client, description, amount } = req.body;
echo.
echo if(!name ^|^| !client ^|^| !description ^|^| !amount){
echo return res.status(400).json({error:"All fields required"});
echo }
echo.
echo const doc = new PDFDocument();
echo.
echo res.setHeader("Content-Disposition","attachment; filename=invoice.pdf");
echo res.setHeader("Content-Type","application/pdf");
echo.
echo doc.pipe(res);
echo.
echo doc.fontSize(25).text("Invoice",{align:"center"});
echo doc.moveDown();
echo doc.text(`Invoice Number: ${invoiceNumber}`);
echo doc.moveDown();
echo.
echo doc.text(`From: ${name}`);
echo doc.text(`Client: ${client}`);
echo doc.text(`Service: ${description}`);
echo doc.text(`Amount: $${amount}`);
echo.
echo doc.end();
echo ^});
echo.
echo const PORT = process.env.PORT ^|^| 3000;
echo app.listen(PORT,() =^> ^{
echo console.log(`Server running on http://localhost:${PORT}`);
echo ^});
) > server.js


echo Creating frontend...

(
echo ^<!DOCTYPE html^>
echo ^<html^>
echo ^<head^>
echo ^<title^>Invoice Generator^</title^>
echo ^</head^>
echo ^<body style="font-family:Arial;padding:40px;"^>
echo ^<h2^>Create Invoice^</h2^>
echo.
echo Name:^<br^>
echo ^<input id="name"^>^<br^><br^>
echo Client:^<br^>
echo ^<input id="client"^>^<br^><br^>
echo Service:^<br^>
echo ^<input id="description"^>^<br^><br^>
echo Amount:^<br^>
echo ^<input id="amount" type="number"^>^<br^><br^>
echo.
echo ^<button onclick="generate()"^>Generate Invoice^</button^>
echo.
echo ^<script^>
echo async function generate(){
echo const name=document.getElementById("name").value;
echo const client=document.getElementById("client").value;
echo const description=document.getElementById("description").value;
echo const amount=document.getElementById("amount").value;
echo.
echo const res = await fetch("/generate",{
echo method:"POST",
echo headers:{ "Content-Type":"application/json"},
echo body:JSON.stringify({name,client,description,amount})
echo });
echo.
echo const blob = await res.blob();
echo const url = window.URL.createObjectURL(blob);
echo const a = document.createElement("a");
echo a.href = url;
echo a.download="invoice.pdf";
echo a.click();
echo }
echo ^</script^>
echo ^</body^>
echo ^</html^>
) > public\index.html


echo ===============================
echo Setup complete
echo Run server with:
echo npm run dev
echo ===============================
pause