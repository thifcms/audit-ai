const admin  = require("firebase-admin");
const fetch = require("node-fetch");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { BUILTIN_KNOWLEDGE }  = require("./knowledge");
const { testNeuralPatterns, incrementNeuralAccess, saveNeuralPattern } = require("./neural");

let genAI = null;

function getGenAI() {
  if (!genAI) {
    const apiKey = process.env.V_Gemini_API_Key;
    if (!apiKey) throw new Error("V_Gemini_API_Key não configurada nas variáveis de ambiente.");
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

/**
 * Fallback para o Groq usando fetch direto. Supports multimodal vision payloads.
 */
async function callGroq(systemPrompt, userPrompt, modelName = "llama-3.3-70b-versatile", jsonMode = true, inlineData = null) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    throw new Error("GROQ_API_KEY não configurada nas variáveis de ambiente.");
  }

  const url = "https://api.groq.com/openai/v1/chat/completions";
  
  const messages = [
    { role: "system", content: systemPrompt }
  ];

  if (inlineData) {
    const mime = inlineData.mimeType || "image/png";
    const base64Img = `data:${mime};base64,${inlineData.data}`;
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        {
          type: "image_url",
          image_url: {
            url: base64Img
          }
        }
      ]
    });
  } else {
    messages.push({ role: "user", content: userPrompt });
  }

  const body = {
    model: modelName,
    messages,
    temperature: 0.1
  };

  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${groqKey}`
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API Error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Tenta executar a chamada de IA rotacionando entre os modelos permitidos (Gemini e Groq).
 * Garante a ordem de prioridade para todas as chamadas.
 */
async function callAIWithFallback(systemPrompt, userPrompt, jsonMode = true, inlineData = null) {
  let modelsToTry = [
    { provider: "gemini", model: "gemini-2.0-flash" },
    { provider: "gemini", model: "gemini-1.5-flash" },
    { provider: "gemini", model: "gemini-1.5-pro" },
    { provider: "groq",   model: "llama-3.3-70b-versatile" }
  ];

  // Se houver imagem (inlineData), a prioridade é Gemini principal para processamento nativo de imagem ou Groq multimodal
  if (inlineData) {
    modelsToTry = [
      { provider: "gemini", model: "gemini-2.0-flash" },
      { provider: "gemini", model: "gemini-1.5-flash" },
      { provider: "gemini", model: "gemini-1.5-pro" },
      { provider: "groq",   model: "llama-3.2-11b-vision-preview" }
    ];
  }

  for (const conf of modelsToTry) {
    try {
      if (conf.provider === "gemini") {
        console.log(`[Engine] Tentando modelo Gemini: ${conf.model}...`);
        const ai = getGenAI();
        const model = ai.getGenerativeModel({ model: conf.model });

        const parts = [{ text: userPrompt }];
        if (inlineData) {
          parts.push({ inlineData });
        }

        const result = await model.generateContent({
          systemInstruction: systemPrompt,
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: jsonMode ? "application/json" : "text/plain",
            maxOutputTokens: 4096
          }
        });

        const text = result.response.text();
        console.log(`[Engine] Sucesso com ${conf.model}.`);
        return { text, provider: conf.provider, model: conf.model };
      } else if (conf.provider === "groq") {
        console.log(`[Engine] Tentando fallback para Groq: ${conf.model}...`);
        const groqText = await callGroq(systemPrompt, userPrompt, conf.model, jsonMode, inlineData);
        console.log(`[Engine] Sucesso com ${conf.model} (Groq).`);
        return { text: groqText, provider: conf.provider, model: conf.model };
      }
    } catch (err) {
      console.warn(`[Engine] O modelo ${conf.provider}/${conf.model} falhou: ${err.message}`);
      // Continua para o próximo
    }
  }

  throw new Error("TODOS os modelos e fallbacks falharam no Analyzer.");
}

/**
 * Analisa semanticamente um documento já parseado.
 * Usa BUILTIN_KNOWLEDGE (sempre disponível) + knowledge customizado do app (se existir).
 */
async function analyzeDocument(parsedDoc, options = {}) {
  const { appId, extractionSchema, useAI = true } = options;

  // 1. Carrega knowledge customizado do app (sobrepõe/enriquece o builtin)
  const customKnowledge = await loadCustomKnowledge(appId);

  // 2. Mescla: builtin é a base, customizado enriquece por cima
  const knowledge = mergeKnowledge(BUILTIN_KNOWLEDGE, customKnowledge);

  if (!useAI || !parsedDoc.text || parsedDoc.text.trim().length < 10) {
    return buildResponse(parsedDoc, {}, knowledge);
  }

  // 3. Identifica tipo do documento ANTES de chamar a IA (heurística rápida)
  const detectedType = detectDocumentType(parsedDoc.text, parsedDoc.type);

  // NOVO: Fluxo de Extração por Massa Neural (Padrões RegEx gerados por IA)
  let neuralResult = { hit: false };
  if (parsedDoc.text) {
    neuralResult = await testNeuralPatterns(parsedDoc.text);
    if (neuralResult.hit) {
      await incrementNeuralAccess(neuralResult.hospitalId, true);
      console.log(`[Engine] Padrão neural validado para o hospital: ${neuralResult.hospitalId}`);
      
      const response = buildResponse(parsedDoc, {
        documentType: `Documento - ${neuralResult.hospitalId}`,
        summary: `Extraído 100% via parser neural local (${neuralResult.hospitalId}).`,
        keyFields: neuralResult.extracted
      }, knowledge, detectedType);
      response.meta.aiProvider = "local neural-parser";
      return response;
    }
  }

  // Se o parser neural não validou, se tem nome de hospital e precisamos buscar novo padrão...
  if (neuralResult.hospitalId === undefined && parsedDoc.text) {
     // não foi match ou não tem padrão. Segue o fluxo.
  }

  // 3b. Interceptador de Etiquetas BARTIRA (Múltiplas com pré-limpeza via Groq e Regex)
  // Expandindo para rodar se houver inlineData (imagem) para tentar ler nativamente a imagem, 
  // já que o OCR Tesseract costuma falhar ou omitir etiquetas.
  const hasBartira = parsedDoc.text && parsedDoc.text.toUpperCase().includes("BARTIRA");
  const isImage = parsedDoc.type === "image" && parsedDoc.inlineData;
  if ((detectedType === "Documento Escaneado" && hasBartira && !isImage)) {
    let cleanText = parsedDoc.text;
    let usedProvider = null;
    let usedModel = null;

    try {
      console.log("[Engine] Tentando extrair etiquetas/limpar OCR. Usando IA + Imagem...");
      const sysPrompt = `Você é um especialista em extração e leitura avançada de dados hospitalares em imagens.
O usuário enviará um texto falho do Tesseract OCR e a imagem original de acompanhamento (se disponível). 
Sua única tarefa é ler cuidadosamente todas as etiquetas visíveis na imagem. Observe as etiquetas estilo 'BARTIRA' ou similares.
Se houver várias etiquetas, você deve separar e transcrever o texto de CADA UMA DELAS. 
Comece cada etiqueta explicitamente com 'BARTIRA Atend: [numero]' ou 'Etiqueta: [identificador]'.
Extraia e mantenha chaves como 'Paciente:', 'Conv:', 'Dt. Nasc:', 'DVH:' ou 'DV/H:'.
Retorne APENAS o texto consolidado com todas as etiquetas encontradas na imagem. NÃO USE MARKDOWN. NÃO USE JSON. Retorne em texto puro.`;
      
      const aiResult = await callAIWithFallback(sysPrompt, parsedDoc.text || "(Texto OCR falhou ou ausente)", false, parsedDoc.inlineData);
      cleanText = aiResult.text;
      usedProvider = aiResult.provider;
      usedModel = aiResult.model;
      console.log(`[Engine] Limpeza/Extração de etiquetas com ${usedModel} concluída com sucesso.`);
    } catch (err) {
      console.warn(`[Engine] IA falhou na pré-limpeza/visão (${err.message}). Aplicando Regex diretamente no texto original.`);
    }

    const bartiraData = parseMultipleBartira(cleanText);
    
    // Se encontrou alguma etiqueta, retornamos o resultado (especialização BARTIRA)
    if (bartiraData.etiquetas && bartiraData.etiquetas.length > 0) {
      const response = buildResponse(parsedDoc, {
        documentType: "Etiqueta BARTIRA (Múltiplas)",
        summary: `Extraídas ${bartiraData.etiquetas.length} etiquetas hospitalares da imagem.`,
        keyFields: bartiraData
      }, knowledge, detectedType);

      if (usedProvider) {
        response.meta.aiProvider = `${usedProvider} + visão multimodal`;
        response.meta.aiModel = usedModel;
      } else {
        response.meta.aiProvider = "regex local";
      }

      return response;
    }
    // Caso contrário (não encontrou nenhuma etiqueta padrão Bartira), continuamos para a extração genérica!
  }

  // 4. Monta prompt especializado para o tipo detectado ou para Leitura Médica Vision
  let systemPrompt, userPrompt;

  if (isImage) {
    systemPrompt = `Você é um especialista em documentos médicos brasileiros. Analise esta imagem e extraia os dados em JSON com os campos:
- atendimento (número de atendimento)
- dataAtendimento (data e hora, se houver)
- paciente (nome completo)
- convenio (plano de saúde / convênio)
- dataNascimento (data de nascimento)

Se houver múltiplas etiquetas na imagem, retorne um array "etiquetas" com cada uma separada contendo os mesmos campos acima.
Retorne APENAS o JSON estruturado, sem texto adicional antes ou depois das marcações JSON.

Para fins de reaprendizado e automação da Massa Neural, adicione TAMBÉM estes campos na raiz do seu JSON principal:
- "hospitalId": O nome principal do local em UMA PALAVRA (ex: "BARTIRA", "SANTAMAJO", "LUIZMATEUS"). Se identificar que é Hospital Bartira, use "BARTIRA".
- "padroes_regex": Um objeto contendo a regra 'Regex' Javascript EXATA em string pura que você usou para identificar CADA UM dos campos do 'keyFields' no texto bruto lido pelo OCR nas próximas leituras. Use o formato: {"regex_atendimento": "Atend:\\\\s*(\\\\d+)", "regex_paciente": "Paciente:\\\\s*([A-ZÀ-Ú\\\\s]+)", "regex_convenio": "Conv:\\\\s*([A-ZÀ-Ú\\\\s]+)", "regex_dataNascimento": "Nasc:\\\\s*([\\\\d/\\\\s:]+)"}. Certifique-se de escapar corretamente os caracteres especiais do JSON de modo que seja válido.`;

    userPrompt = `Favor analisar a imagem médica e extrair os dados médicos no formato JSON solicitado.`;
  } else {
    systemPrompt = buildSystemPrompt(knowledge, extractionSchema, detectedType);
    userPrompt   = buildUserPrompt(parsedDoc, detectedType);
  }

  let aiResult = {};
  let usedModel = null;
  let usedProvider = null;
  let success = false;

  try {
    const aiResp = await callAIWithFallback(systemPrompt, userPrompt, true, parsedDoc.inlineData);
    aiResult = safeParseJSON(aiResp.text);
    usedModel = aiResp.model;
    usedProvider = aiResp.provider;
    success = true;
  } catch (err) {
    if (isImage) {
      console.warn("[Engine] IA de Visão falhou (provavelmente devido a créditos/cota). Tentando analisar via OCR + Groq/Modelos de Texto...");
      try {
        const textSystemPrompt = buildSystemPrompt(knowledge, extractionSchema, detectedType);
        const textUserPrompt = buildUserPrompt(parsedDoc, detectedType) + 
          `\n\nCaso o OCR tenha lido múltiplas etiquetas, extraia todas no formato do JSON solicitado.`;
        
        const aiResp = await callAIWithFallback(textSystemPrompt, textUserPrompt, true, null);
        aiResult = safeParseJSON(aiResp.text);
        usedModel = aiResp.model;
        usedProvider = aiResp.provider;
        success = true;
      } catch (textErr) {
        console.error("[Engine] Erro também no fallback de texto:", textErr.message);
      }
    } else {
      console.error("[Engine] Erro fatal em callAIWithFallback:", err.message);
    }
  }

  if (success && isImage && Object.keys(aiResult).length > 0) {
    // Reorganizar os campos da etiqueta médica para keyFields
    const keyFields = {};
    if (aiResult.etiquetas && Array.isArray(aiResult.etiquetas)) {
      keyFields.etiquetas = aiResult.etiquetas;
    } else if (aiResult.keyFields) {
      Object.assign(keyFields, aiResult.keyFields);
    } else {
      const fields = ["atendimento", "dataAtendimento", "paciente", "convenio", "dataNascimento"];
      fields.forEach(f => {
        if (aiResult[f] !== undefined) {
          keyFields[f] = aiResult[f];
        }
      });
    }
    aiResult.keyFields = keyFields;
    aiResult.documentType = aiResult.etiquetas ? "Múltiplas Etiquetas Médicas" : `Etiqueta Médica - ${aiResult.hospitalId || 'Extraída'}`;
    aiResult.summary = aiResult.etiquetas 
      ? `Extraídas ${aiResult.etiquetas.length} etiquetas hospitalares da imagem.` 
      : `Dados médicos extraídos com sucesso via IA Textual/Vision.`;
  }

  // Auto-Discovery: Salva padrão aprendido na base caso a IA tenha retornado as regexes.
  if (success && aiResult.hospitalId && aiResult.padroes_regex && Object.keys(aiResult.padroes_regex).length > 0) {
    console.log(`[Engine] Auto-Discovery: Aprendendo padrão regex para ${aiResult.hospitalId} e salvando no Firestore.`);
    await saveNeuralPattern(aiResult.hospitalId, aiResult.padroes_regex);
  }

  // Fallback final se todos falharam
  if (!success) {
    console.error("[Engine] TODOS os modelos falharam. Usando parser local de regex como fallback final.");
    
    const fallbackData = localRegexParser(parsedDoc.text);
    aiResult = {
      documentType: "Desconhecido (Falha na IA)",
      summary: "Falha na IA por limite de cota/creditos ou chave ausente. Extração local aplicada.",
      keyFields: fallbackData
    };
    usedModel = "regex-parser";
    usedProvider = "local";
  }

  const response = buildResponse(parsedDoc, aiResult, knowledge, detectedType);
  if (usedProvider) {
    response.meta.aiProvider = usedProvider;
    response.meta.aiModel = usedModel;
  }

  return response;
}

/**
 * Detecta o tipo de documento por heurística (rápido, sem IA).
 * Usado para especializar o prompt antes de chamar o Gemini.
 */
function detectDocumentType(text, parserType) {
  if (!text) return parserType?.toUpperCase() || "DESCONHECIDO";
  const t = text.toUpperCase();

  const patterns = BUILTIN_KNOWLEDGE.commonPatterns.documentIdentifiers;
  for (const [type, keywords] of Object.entries(patterns)) {
    if (keywords.some(kw => t.includes(kw.toUpperCase()))) return type;
  }

  // Fallbacks por tipo de parser
  if (parserType === "xlsx" || parserType === "csv") return "Planilha";
  if (parserType === "image") return "Documento Escaneado";
  if (parserType === "xml")   return "XML Fiscal";
  return "Documento";
}

/** Carrega knowledge customizado do Firestore (se o app já treinou) */
async function loadCustomKnowledge(appId) {
  try {
    const db = admin.firestore();

    // Tenta carregar knowledge específico do app
    if (appId) {
      const appDoc = await db.collection("knowledge_base").doc(appId).get();
      if (appDoc.exists) return appDoc.data();
    }

    // Fallback para global customizado (se existir)
    const globalDoc = await db.collection("knowledge_base").doc("global").get();
    if (globalDoc.exists && globalDoc.data().trainedAt !== "builtin") {
      return globalDoc.data();
    }

    return {}; // Sem customização — usa só o builtin
  } catch {
    return {};
  }
}

/** Mescla knowledge builtin com customizado do app */
function mergeKnowledge(builtin, custom) {
  if (!custom || Object.keys(custom).length === 0) return builtin;

  return {
    ...builtin,
    systemPrompt: custom.systemPrompt
      ? `${builtin.systemPrompt}\n\nREGRAS ADICIONAIS DO SEU NEGÓCIO:\n${custom.systemPrompt}`
      : builtin.systemPrompt,
    documentTypes: [...new Set([...builtin.documentTypes, ...(custom.documentTypes || [])])],
    keyFields:     { ...builtin.keyFields, ...(custom.keyFields || {}) },
    examples:      [...builtin.examples, ...(custom.examples || [])].slice(0, 10),
    validationRules: [...new Set([...builtin.validationRules, ...(custom.validationRules || [])])],
    domainRules:   custom.domainRules || null
  };
}

/** Monta system prompt completo */
function buildSystemPrompt(knowledge, extractionSchema, detectedType) {
  let prompt = knowledge.systemPrompt;

  // Adiciona exemplos (few-shot) relevantes para o tipo detectado
  const relevantExamples = knowledge.examples.filter(ex =>
    !detectedType || ex.output?.documentType === detectedType || knowledge.examples.indexOf(ex) < 3
  ).slice(0, 3);

  if (relevantExamples.length > 0) {
    prompt += `\n\nEXEMPLOS DE SAÍDA ESPERADA:\n`;
    relevantExamples.forEach((ex, i) => {
      prompt += `\nExemplo ${i + 1}:\nEntrada: "${ex.input.substring(0, 200)}..."\nSaída: ${JSON.stringify(ex.output)}\n`;
    });
  }

  // Regras de validação embutidas
  if (knowledge.validationRules?.length > 0) {
    prompt += `\n\nREGRAS DE VALIDAÇÃO:\n${knowledge.validationRules.join("\n")}`;
  }

  // Regras customizadas do app
  if (knowledge.domainRules) {
    prompt += `\n\nREGRAS DO NEGÓCIO:\n${knowledge.domainRules}`;
  }

  // Schema de extração customizado
  if (extractionSchema) {
    prompt += `\n\nESQUEMA DE EXTRAÇÃO SOLICITADO:\n${JSON.stringify(extractionSchema, null, 2)}`;
  }

  return prompt;
}

/** Monta prompt do usuário com contexto do documento */
function buildUserPrompt(parsedDoc, detectedType) {
  const parts = [];

  parts.push(`TIPO DETECTADO: ${detectedType}`);
  parts.push(`FORMATO DO ARQUIVO: ${parsedDoc.type?.toUpperCase()}`);

  if (parsedDoc.text) {
    const truncated = parsedDoc.text.substring(0, 6000);
    parts.push(`\nCONTEÚDO:\n${truncated}${parsedDoc.text.length > 6000 ? "\n[... truncado ...]" : ""}`);
  }

  if (parsedDoc.tables?.length > 0) {
    parts.push(`\nTABELAS (${parsedDoc.tables.length} encontradas):`);
    parsedDoc.tables.slice(0, 2).forEach((t, i) => {
      parts.push(`Tabela ${i + 1} "${t.sheetName}": ${t.headers.join(" | ")}`);
      parts.push(`Amostra: ${JSON.stringify(t.rows.slice(0, 3))}`);
    });
  }

  if (parsedDoc.fields && Object.keys(parsedDoc.fields).length > 0) {
    parts.push(`\nCAMPOS PRÉ-EXTRAÍDOS:\n${JSON.stringify(parsedDoc.fields, null, 2)}`);
  }

  if (parsedDoc.meta?.confidence) {
    parts.push(`\nCONFIANÇA OCR: ${parsedDoc.meta.confidence}% (${parsedDoc.meta.qualityScore})`);
  }

  parts.push(`
Extraia e retorne APENAS este JSON:
{
  "documentType":  "tipo exato do documento",
  "summary":       "1 frase descrevendo o documento",
  "keyFields":     { "campos mais importantes": "valores" },
  "entities": {
    "emitter":    { "nome": null, "cnpjCpf": null, "endereco": null },
    "recipient":  { "nome": null, "cnpjCpf": null, "endereco": null }
  },
  "financials": {
    "totalValue":  null,
    "currency":    "BRL",
    "taxes":       { "icms": null, "ipi": null, "pis": null, "cofins": null, "iss": null },
    "discounts":   null,
    "netValue":    null
  },
  "dates": {
    "emission":    null,
    "due":         null,
    "competence":  null
  },
  "flags": {
    "hasSignature": false,
    "isCancelled":  false,
    "needsReview":  false,
    "reviewReason": null
  }
}

INSTRUÇÃO EXTRA DE REDE NEURAL:
Se o documento parecer ser de um Hospital, Laboratório ou Clínica, adicione TAMBÉM as seguintes chaves na raiz do seu JSON principal:
- "hospitalId": O nome principal do local em UMA PALAVRA (ex: "BARTIRA", "LUIZMATEUS", "NOTREDAME").
- "padroes_regex": Um objeto contendo a regra 'Regex' Javascript EXATA em string pura que você usou para identificar CADA UM dos campos do 'keyFields'. Use formato {"regex_nomeDoCampo": "..."}. Por exemplo, {"regex_paciente": "Paciente:\\\\s*([A-ZÀ-Ú\\\\s]+)", "regex_atendimento": "Atend:\\\\s*(\\\\d+)"}. ISSO É CRUCIAL. Mantenha os escapes de barra invertida "\\\\" corretos para JSON.
`);

  return parts.join("\n");
}

/** Monta resposta final combinando parser + IA */
function buildResponse(parsedDoc, aiResult, knowledge, detectedType) {
  return {
    raw: {
      text:   parsedDoc.text
        ? parsedDoc.text.substring(0, 500) + (parsedDoc.text.length > 500 ? "..." : "")
        : "",
      tables: parsedDoc.tables || [],
      fields: parsedDoc.fields || {}
    },
    analysis: {
      documentType: aiResult.documentType || detectedType || parsedDoc.type?.toUpperCase() || "DESCONHECIDO",
      summary:      aiResult.summary      || "",
      keyFields:    aiResult.keyFields    || parsedDoc.fields || {},
      entities:     aiResult.entities     || { emitter: {}, recipient: {} },
      financials:   aiResult.financials   || { totalValue: null, currency: "BRL", taxes: {}, discounts: null, netValue: null },
      dates:        aiResult.dates        || { emission: null, due: null, competence: null },
      flags:        aiResult.flags        || { hasSignature: false, isCancelled: false, needsReview: false }
    },
    meta: {
      ...parsedDoc.meta,
      aiProcessed:       Object.keys(aiResult).length > 0,
      detectedType,
      knowledgeVersion:  knowledge.version || "builtin",
      hasCustomKnowledge: knowledge.sampleCount > 0 && knowledge.trainedAt !== "builtin"
    }
  };
}

function safeParseJSON(text) {
  try { return JSON.parse(text); }
  catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) { try { return JSON.parse(match[1]); } catch { return {}; } }
    return {};
  }
}

/** Parser para múltiplas Etiquetas do padrão BARTIRA (aplicado sobre texto limpo ou bruto) */
function parseMultipleBartira(text) {
  const etiquetas = [];
  
  // Divide o texto pelo padrão "BARTIRA" (ignorando case) para criar blocos individuais
  const blocks = text.split(/BARTIRA/i);
  
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];
    const data = {};
    
    const atendMatch = block.match(/Atend[:\s]+(\d+)/i);
    if (atendMatch) data.atendimento = atendMatch[1];
    
    // Tenta capturar data de atendimento (DVH ou DV/H)
    const dataAtendMatch = block.match(/DV\/?H[:\s]+([\d]{2}\/[\d]{2}\/[\d]{4}\s+[\d]{2}:[\d]{2})/i);
    if (dataAtendMatch) data.dataAtendimento = dataAtendMatch[1];
    
    // Captura o paciente até a quebra de linha ou o próximo campo (Dt. Nasc, Nome Social, Idade)
    const pacMatch = block.match(/Paciente[:\s]+(.+?)(?:\r?\n|\s+Nome Social:|\s+Dt\.?|\s+Idade:)/i);
    if (pacMatch) data.paciente = pacMatch[1].trim();

    const dtNascMatch = block.match(/Dt\.?\s*Nasc(?:imento)?[:\s]+([\d]{2}\/[\d]{2}\/[\d]{4})/i);
    if (dtNascMatch) data.dataNascimento = dtNascMatch[1];
    
    const convMatch = block.match(/Conv(?:[eé]nio)?[:\s]+(.+?)(?:\s+Filia[cç][aã]o:|\r?\n|$)/i);
    if (convMatch) data.convenio = convMatch[1].trim();

    // Só ignora blocos totalmente inúteis, mas basta ter um doc base ou paciente
    if (data.atendimento || data.paciente) {
      etiquetas.push(data);
    }
  }
  
  return { etiquetas };
}

/** Fallback final: Parser de regex genérico para extrair o mínimo possível */
function localRegexParser(text) {
  if (!text) return {};
  
  const data = {};
  
  // Tenta extrair CNPJ
  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (cnpjMatch) data.cnpj = cnpjMatch[0];
  
  // Tenta extrair CPF
  const cpfMatch = text.match(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
  if (cpfMatch) data.cpf = cpfMatch[0];
  
  // Tenta extrair valor em R$
  const valorMatch = text.match(/R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  if (valorMatch) data.valor = valorMatch[1];
  
  // Tenta extrair data DD/MM/AAAA
  const dataMatch = text.match(/\d{2}\/\d{2}\/\d{4}/);
  if (dataMatch) data.data = dataMatch[0];
  
  return data;
}

module.exports = { analyzeDocument };
