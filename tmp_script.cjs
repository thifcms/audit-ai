const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(/required: \["documentType", "summary", "nome_paciente", "nome_paciente_confidence", "numero_atendimento", "numero_atendimento_confidence", "idade", "idade_confidence", "convenio", "convenio_confidence", "data_nascimento", "data_nascimento_confidence"\]/g, 'required: ["documentType", "summary", "etiquetas"]');

// Add console.log to normalizeExtractionData at lines 923 and 1184 approx
code = code.replace(/resultData = normalizeExtractionData\(resultData\);\n\n      return res\.status\(200\)\.json\(\{/g, 'resultData = normalizeExtractionData(resultData);\n      console.log("Pacientes recebidos da IA:", resultData?.etiquetas?.length || 0);\n\n      return res.status(200).json({');

fs.writeFileSync('server.ts', code);
console.log("Done");
