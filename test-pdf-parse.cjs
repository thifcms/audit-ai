const pdfParse = require("pdf-parse");
console.log("typeof pdfParse:", typeof pdfParse);
if (typeof pdfParse === "function") {
  const pdfData = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [ 3 0 R ] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
70 700 Td
(BARTIRA PACIENTE: ANDREA SILVA GUIDASTRE ATENDIMENTO: 3376902 CONVENIO: PORTO SAUDE) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000192 00000 n
trailer
<< /Size 5 /Root 1 0 R >>
startxref
340
%%EOF`;

  pdfParse(Buffer.from(pdfData, "utf-8")).then(res => {
    console.log("Extracted Text:", JSON.stringify(res.text));
  }).catch(err => {
    console.error("PDF Parse error:", err);
  });
} else {
  console.log("keys of pdfParse:", Object.keys(pdfParse));
}
