const soulmvRegex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s+([A-Z0-9])\s+(CLINICO|CLÍNICO|CIRURGIAO|CIRURGIÃO|CIRURGICO|CIRÚRGICO|PRIMEIRO AUXILIAR|SEGUNDO AUXILIAR|TERCEIRO AUXILIAR|ANESTESISTA|INSTRUMENTADOR)\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d+)\s+(\d+)\s+([\d.,]+)\s*(\*)?\s*$/i;

const soulmvGenericRegex = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s+([A-Z0-9])\s+(.+?)\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d+)\s+(\d+)\s+([\d.,]+)\s*(\*)?\s*$/i;

const sampleLines = [
  "61385 623723 643606 CARMELA PERES DE ALMEIDA N CLINICO HSV SAUDE 09/06/26 1 0 108,00",
  "60549 43692 610611 MARCOS ANTONIO MOTA N CIRURGIAO PORTO SEGURO 26/02/26 1 1300 494,00 *",
  "59987 44975 626321 ANARAI DA SILVA ARAUJO N PRIMEIRO AUXILIAR MEDISERVICE 16/04/26 1 0 126,59 *",
  "59987 44975 626321 FULANO DE TAL N OUTRA COISA MEDISERVICE 16/04/26 1 0 126,59 *"
];

for (const line of sampleLines) {
  const match = line.match(soulmvRegex);
  if (match) {
    console.log("MATCH SUCCESS:");
    console.log("Atividade extraída:", match[6]);
    console.log("Convênio extraído:", match[7]);
    console.log("--------------------");
  } else if (line.match(soulmvGenericRegex)) {
    console.warn(`[SOULMV Parser] Linha ignorada por Atividade não reconhecida: "${line.trim()}"`);
  } else {
    console.log("FAILED TO MATCH ENTIRELY:", line);
  }
}
