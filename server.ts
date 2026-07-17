import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import cors from "cors";

// Let esbuild handle these CJS modules by importing them directly
// import { serverTimestamp } from "firebase/firestore";

import { logMiddleware } from "./functions/src/middleware/logger.js";
import { authMiddleware } from "./functions/src/middleware/auth.js";

import readRoute from "./functions/src/routes/read.js";
import compareRoute from "./functions/src/routes/compare.js";
import calculateRoute from "./functions/src/routes/calculate.js";
import auditRoute from "./functions/src/routes/audit.js";
import historyRoute from "./functions/src/routes/history.js";
import trainRoute from "./functions/src/routes/train.js";
import keysRoute from "./functions/src/routes/keys.js";
import reconcileRoute from "./functions/src/routes/reconcile.js";
import externalRoute from "./functions/src/routes/external.js";

import dbUtils from "./functions/src/utils/db.js";
const { getDB, serverTimestamp: dbServerTimestamp } = dbUtils;
import pdfUtils from "./functions/src/parsers/pdf.js";
const { extractSoulmvTable } = pdfUtils;

dotenv.config();

const MOCK_MODE = process.env.MOCK_MODE === 'true';

// --- Init Firebase ---
// Using modular SDK now inside db.js so no compat app init needed here.

// --- Learning Incremental Helpers ---
function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.warn(`[Timeout] Operation exceeded ${ms}ms limit. Bypassing.`);
      resolve(fallbackValue);
    }, ms);
  });
  return Promise.race([
    promise
      .then((val) => {
        clearTimeout(timeoutId);
        return val;
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        console.error("[Timeout Wrapper Error] Operation failed:", err);
        return fallbackValue;
      }),
    timeoutPromise
  ]);
}

function getImageHash(base64Data: string): string {
  if (!base64Data) return "";
  const base64Clean = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  return crypto.createHash("md5").update(base64Clean).digest("hex");
}

async function parsePdfText(fileBuffer: Buffer): Promise<string> {
  const tStart = performance.now();
  console.log(`[parsePdfText TIMING] [${new Date().toISOString()}] Starting parsePdfText function...`);
  try {
    const tImportStart = performance.now();
    const pdfParseModule = await import("pdf-parse") as any;
    const tImportEnd = performance.now();
    console.log(`[parsePdfText TIMING] [${new Date().toISOString()}] Import of pdf-parse completed in ${(tImportEnd - tImportStart).toFixed(2)}ms`);
    
    let text = "";
    if (pdfParseModule.PDFParse) {
      const uint8 = new Uint8Array(fileBuffer);
      const p = new pdfParseModule.PDFParse(uint8);
      const res = await p.getText();
      text = res.text || "";
    } else {
      const pdfParse = pdfParseModule.default || pdfParseModule;
      if (typeof pdfParse === "function") {
        const res = await pdfParse(fileBuffer);
        text = res.text || "";
      } else if (pdfParse && typeof pdfParse.PDFParse === "function") {
        const uint8 = new Uint8Array(fileBuffer);
        const p = new pdfParse.PDFParse(uint8);
        const res = await p.getText();
        text = res.text || "";
      } else {
        console.warn("[parsePdfText] Nenhum método de parse de PDF válido encontrado.");
      }
    }
    const tEnd = performance.now();
    console.log(`[parsePdfText TIMING] [${new Date().toISOString()}] Parsing logic completed in ${(tEnd - tImportEnd).toFixed(2)}ms. Total parsePdfText time: ${(tEnd - tStart).toFixed(2)}ms`);
    return text;
  } catch (err: any) {
    const tEnd = performance.now();
    console.error(`[parsePdfText TIMING] [${new Date().toISOString()}] Erro ao extrair texto do PDF após ${(tEnd - tStart).toFixed(2)}ms:`, err.message);
    return "";
  }
}

function detectHospitalName(text: string): string {
  if (!text) return "Outro";
  const uppercased = text.toUpperCase();
  const knownHospitals = [
    "BARTIRA", "ALIANÇA", "SANCTA MAGGIORE", "PREVENT SENIOR", "EINSTEIN", 
    "SÃO LUIZ", "COPA D'OR", "ALVORADA", "SÃO JOSÉ", "BP - BENEFICÊNCIA PORTUGUESA", 
    "BENEFICENCIA", "HOSPITAL ALMANARA", "9 DE JULHO", "SIRIO LIBANES", "SÍRIO LIBANÊS"
  ];
  
  for (const name of knownHospitals) {
    if (uppercased.includes(name)) {
      return name;
    }
  }
  
  const match = uppercased.match(/(?:HOSPITAL|CLINICA|HOSP\.)\s+([A-ZÀ-Ú0-9\-]+(?:\s+[A-ZÀ-Ú0-9\-]+){0,2})/);
  if (match && match[1]) {
    const trimmed = match[1].trim();
    if (trimmed.length > 2 && !["DE", "DO", "DA", "GERAL", "A"].includes(trimmed)) {
      return trimmed;
    }
  }
  return "Outro";
}

function extractOrttramTable(pdfText: string, prompt: string): any {
  if (!pdfText || !prompt) return null;
  
  let cadastradoName = "";
  const matchDoc = prompt.match(/Nome do médico cadastrado:\s*([^\n\r\\]+)/i);
  if (matchDoc) {
    cadastradoName = matchDoc[1].trim();
  }
  
  if (!cadastradoName) {
    console.log("[ORTTRAM Parser] Nome do médico cadastrado não encontrado no prompt.");
    return null;
  }
  
  const normalizeName = (name: string): string => {
    if (!name) return "";
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(DR\.|DRA\.|DR|DRA)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  };
  
  const normalizedCadastrado = normalizeName(cadastradoName);
  if (!normalizedCadastrado) {
    console.log("[ORTTRAM Parser] Nome do médico cadastrado normalizado ficou vazio.");
    return null;
  }
  
  const lines = pdfText.split("\n");
  const parsedRows: any[] = [];
  
  const startRegex = /^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/;
  const endRegex = /\s+(\d{2}\/\d{2}\/\d{2,4})\s+(\d+)\s+(\d+)\s+R\$\s*([\d.,]+)\s+(\d+)\s+R\$\s*([\d.,]+)\s*$/i;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    const startMatch = trimmedLine.match(startRegex);
    if (!startMatch) continue;
    
    const remessa = startMatch[1];
    const conta = startMatch[2];
    const atendimento = startMatch[3];
    const restOfLine = startMatch[4];
    
    const normalizedRest = normalizeName(restOfLine);
    const docIdx = normalizedRest.indexOf(normalizedCadastrado);
    
    if (docIdx === -1) continue;
    
    const beforeDoc = normalizedRest.substring(0, docIdx);
    const paciente = beforeDoc.trim();
    
    const suffixStart = docIdx + normalizedCadastrado.length;
    let suffix = restOfLine.substring(suffixStart);
    
    // --- LIMPEZA DE ESPAÇOS POR KERNING NO SUFIXO ---
    const rsIndices: number[] = [];
    let idx = suffix.toUpperCase().indexOf("R$");
    while (idx !== -1) {
      rsIndices.push(idx);
      idx = suffix.toUpperCase().indexOf("R$", idx + 2);
    }
    
    if (rsIndices.length >= 2) {
      const secondLastRsIdx = rsIndices[rsIndices.length - 2];
      const lastRsIdx = rsIndices[rsIndices.length - 1];
      
      const partBeforeFirstRs = suffix.substring(0, secondLastRsIdx);
      const partBetweenRs = suffix.substring(secondLastRsIdx, lastRsIdx);
      const partAfterLastRs = suffix.substring(lastRsIdx);
      
      const cleanPartAfterLastRs = partAfterLastRs.replace(/\s+/g, "");
      
      const trimmedBetween = partBetweenRs.trim();
      const lastSpaceIdx = trimmedBetween.lastIndexOf(" ");
      if (lastSpaceIdx !== -1) {
        const percentage = trimmedBetween.substring(lastSpaceIdx + 1);
        const valuePart = trimmedBetween.substring(0, lastSpaceIdx);
        const cleanValuePart = valuePart.replace(/\s+/g, "");
        
        const cleanPartBetween = cleanValuePart + " " + percentage;
        suffix = partBeforeFirstRs + cleanPartBetween + " " + cleanPartAfterLastRs;
      }
    }
    // ------------------------------------------------
    
    const endMatch = suffix.match(endRegex);
    if (!endMatch) continue;
    
    const data = endMatch[1];
    const quant = endMatch[2];
    const qtCh = endMatch[3];
    const vlRepasseStr = endMatch[4];
    const porcentagem = endMatch[5];
    const vlContaStr = endMatch[6];
    
    const endMatchIdx = suffix.search(endRegex);
    const textBetween = endMatchIdx !== -1 ? suffix.substring(0, endMatchIdx).trim().toUpperCase() : "";
    const isClinico = textBetween.includes("CLINICO") || textBetween.includes("CLÍNICO");
    let atividade = "CIRURGICO";
    if (isClinico) {
      atividade = "CLINICO";
    } else {
      const normalizedBetween = textBetween.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedBetween.includes("CIRURGIAO")) {
        atividade = "CIRURGIAO";
      } else if (normalizedBetween.includes("PRIMEIRO AUXILIAR") || normalizedBetween.includes("1 AUXILIAR") || normalizedBetween.includes("1O AUXILIAR") || normalizedBetween.includes("1º AUXILIAR")) {
        atividade = "PRIMEIRO AUXILIAR";
      } else if (normalizedBetween.includes("SEGUNDO AUXILIAR") || normalizedBetween.includes("2 AUXILIAR") || normalizedBetween.includes("2O AUXILIAR") || normalizedBetween.includes("2º AUXILIAR")) {
        atividade = "SEGUNDO AUXILIAR";
      } else if (normalizedBetween.includes("INSTRUMENTADOR")) {
        atividade = "INSTRUMENTADOR";
      } else {
        atividade = "CIRURGIAO"; // default fallback for surgical
      }
    }
    
    const valorStr = vlRepasseStr.replace(/\./g, "").replace(",", ".");
    const valorNum = parseFloat(valorStr) || 0;
    
    parsedRows.push({
      nome_paciente: paciente,
      numero_atendimento: atendimento,
      valor: valorNum,
      data_atendimento: data,
      atividade: atividade
    });
  }
  
  if (parsedRows.length === 0) return null;
  
  const promptUpper = prompt.toUpperCase();
  const hasClinicalTerm = promptUpper.includes("CLINICO");
  const hasSurgicalTerm = promptUpper.includes("CIRURGICO") || promptUpper.includes("CIRURGIAO") || promptUpper.includes("AUXILIAR") || promptUpper.includes("DIFERENTE");
  
  let filteredRows = parsedRows;
  if (hasSurgicalTerm) {
    filteredRows = parsedRows.filter(r => r.atividade !== "CLINICO");
  } else if (hasClinicalTerm) {
    filteredRows = parsedRows.filter(r => r.atividade === "CLINICO");
  }
  
  const groupedMap = new Map<string, any>();
  for (const row of filteredRows) {
    const key = row.numero_atendimento;
    const activityKey = (row.atividade || "").toUpperCase();
    
    if (groupedMap.has(key)) {
      const existing = groupedMap.get(key);
      existing.valor += row.valor;
      if (hasSurgicalTerm && activityKey) {
        existing.breakdown[activityKey] = (existing.breakdown[activityKey] || 0) + row.valor;
      }
    } else {
      const entry: any = {
        nome_paciente: row.nome_paciente,
        numero_atendimento: row.numero_atendimento,
        valor: row.valor,
        data_atendimento: row.data_atendimento
      };
      if (hasSurgicalTerm) {
        entry.breakdown = {};
        if (activityKey) {
          entry.breakdown[activityKey] = row.valor;
        }
      }
      groupedMap.set(key, entry);
    }
  }
  
  const resultados = Array.from(groupedMap.values());
  for (const res of resultados) {
    res.valor = Math.round(res.valor * 100) / 100;
    if (res.breakdown) {
      for (const [k, v] of Object.entries(res.breakdown)) {
        res.breakdown[k] = Math.round((v as number) * 100) / 100;
      }
    }
  }
  
  return { resultados };
}

function extractWithLocalRegex(rawText: string, hospital: string): any {
  if (!rawText) return null;
  const lines = rawText.split("\n");
  
  let nome_paciente = "";
  let numero_atendimento = "";
  let convenio = "";
  let data_nascimento = "";
  
  for (const line of lines) {
    const upp = line.trim().toUpperCase();
    
    // PACIENTE Name match
    if (!nome_paciente) {
      const matchPac = line.match(/(?:PACIENTE|NOME|PAC)\s*[:\-=]\s*([A-Za-zÀ-ÖØ-öø-ÿ\s'\.\-]+)/i);
      if (matchPac && matchPac[1]) {
        nome_paciente = matchPac[1].trim().toUpperCase();
      }
    }
    
    // ATENDIMENTO Number match
    if (!numero_atendimento) {
      const matchAtend = line.match(/(?:ATENDIMENTO|ATEND|REGISTRO|ID|Nº\s*ATEND|Nº\s*REG)\s*[:\-=]\s*(\d+)/i);
      if (matchAtend && matchAtend[1]) {
        numero_atendimento = matchAtend[1].trim();
      }
    }
    
    // CONVENIO match
    if (!convenio) {
      const matchConv = line.match(/(?:CONVENIO|CONVÊNIO|CONV|PLANO|OPERADORA)\s*[:\-=]\s*([A-Za-zÀ-ÖØ-öø-ÿ\s'\.\-]+)/i);
      if (matchConv && matchConv[1]) {
        convenio = matchConv[1].trim().toUpperCase();
      }
    }
    
    // NASCIMENTO match
    if (!data_nascimento) {
      const matchNasc = line.match(/(?:NASCIMENTO|NASC|DATA\s*NASC)\s*[:\-=]\s*(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/i);
      if (matchNasc && matchNasc[1]) {
        const rawDate = matchNasc[1].trim();
        if (rawDate.includes("/")) {
          const parts = rawDate.split("/");
          if (parts[0].length === 2 && parts[2]?.length === 4) {
            data_nascimento = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else {
            data_nascimento = rawDate;
          }
        } else {
          data_nascimento = rawDate;
        }
      }
    }
  }
  
  if (!convenio) {
    const providers = ["UNIMED", "BRADESCO", "SULAMERICA", "AMIL", "NOTREDAME", "INTERMEDICA", "ALLIANZ", "GOLDEN CROSS", "PORTO SEGURO", "SUS"];
    for (const p of providers) {
      if (rawText.toUpperCase().includes(p)) {
        convenio = p;
        break;
      }
    }
  }
  
  if (!numero_atendimento) {
    const numMatch = rawText.match(/\b\d{5,9}\b/);
    if (numMatch) {
      numero_atendimento = numMatch[0];
    }
  }
  
  if (nome_paciente && numero_atendimento && convenio) {
    return {
      nome_paciente,
      numero_atendimento,
      convenio,
      data_nascimento: data_nascimento || undefined
    };
  }
  return null;
}

async function getFewShotPrompt(hospital: string): Promise<string> {
  try {
    const db = getDB();
    let examples: any[] = [];
    
    // Verified ones first
    const verifiedSnap = await withTimeout(
      db.collection("learned_examples")
        .where("verified_by_user", "==", true)
        .where("corrected_by_user", "==", false)
        .limit(10)
        .get(),
      1500, // 1.5 seconds budget
      { empty: true, forEach: () => {} } as any
    );
      
    verifiedSnap.forEach(doc => {
      const d = doc.data();
      if (!hospital || hospital === "Outro" || d.hospital === hospital) {
        examples.push(d);
      }
    });

    if (examples.length < 3) {
      const highConfSnap = await withTimeout(
        db.collection("learned_examples")
          .where("confidence", "==", "high")
          .where("corrected_by_user", "==", false)
          .limit(15)
          .get(),
        1500, // 1.5 seconds budget
        { empty: true, forEach: () => {} } as any
      );
        
      highConfSnap.forEach(doc => {
        const d = doc.data();
        if (!examples.some(x => x.id === d.id)) {
          if (!hospital || hospital === "Outro" || d.hospital === hospital) {
            examples.push(d);
          }
        }
      });
    }

    examples.sort((a, b) => {
      const tA = a.created_at?.toDate ? a.created_at.toDate().getTime() : 0;
      const tB = b.created_at?.toDate ? b.created_at.toDate().getTime() : 0;
      return tB - tA;
    });

    const selected = examples.slice(0, 3);
    if (selected.length === 0) return "";

    let fewShotPrompt = "\n\nAqui estão exemplos de extrações corretas anteriores deste tipo de etiqueta:\n";
    selected.forEach((ex, idx) => {
      fewShotPrompt += `\nExemplo ${idx + 1}: ${ex.hospital} -> ${JSON.stringify(ex.extracted_data)}\n`;
    });
    fewShotPrompt += "\nAgora extraia os dados desta nova imagem seguindo exatamente o mesmo padrão e formato.\n";
    return fewShotPrompt;
  } catch (err) {
    console.error("[Few Shot Query] Failed to search examples:", err);
    return "";
  }
}

async function saveLearnedExample(
  fileBase64: string,
  resultData: any,
  extractedText: string
) {
  try {
    const db = getDB();
    const image_hash = getImageHash(fileBase64);
    
    const docType = String(resultData.documentType || "etiqueta_hospitalar").toLowerCase().trim();
    const isNotaFiscal = docType === "nota_fiscal";
    
    let hospital = "";
    let extracted_data: any = {};
    let criticalsComplete = false;
    let auto_confidence_ok = false;
    let avgConfidence = 100;
    
    const isFieldComplete = (field: any) => {
      if (field === undefined || field === null) return false;
      const str = String(field).trim();
      return str !== "" && str !== "---";
    };

    if (isNotaFiscal) {
      // In invoices, the 'emitente' represents the tomador (hospital/client pagador)
      hospital = resultData.emitente || detectHospitalName(extractedText || resultData.summary || "") || "Outro";
      extracted_data = {
        emitente: resultData.emitente || "",
        cnpjEmitente: resultData.cnpjEmitente || "",
        valorTotal: parseBrazilianDecimal(resultData.valorTotal),
        valorLiquido: parseBrazilianDecimal(resultData.valorLiquido),
        numeroNota: resultData.numeroNota || "",
        dataEmissao: resultData.dataEmissao || ""
      };
      
      const valTotOk = extracted_data.valorTotal > 0 || extracted_data.valorLiquido > 0;

      criticalsComplete = isFieldComplete(extracted_data.emitente) &&
                          valTotOk &&
                          isFieldComplete(extracted_data.numeroNota) &&
                          isFieldComplete(extracted_data.dataEmissao);
                          
      const pEmiConf = typeof resultData.emitente_confidence === "number" ? resultData.emitente_confidence : 100;
      const pNumNConf = typeof resultData.numeroNota_confidence === "number" ? resultData.numeroNota_confidence : 100;
      const pDatEConf = typeof resultData.dataEmissao_confidence === "number" ? resultData.dataEmissao_confidence : 100;
      const pValTConf = typeof resultData.valorTotal_confidence === "number" ? resultData.valorTotal_confidence : 100;
      const pValLConf = typeof resultData.valorLiquido_confidence === "number" ? resultData.valorLiquido_confidence : 100;
      
      auto_confidence_ok = (pEmiConf >= 90) && (pNumNConf >= 90) && (pDatEConf >= 90) && (pValTConf >= 90) && (pValLConf >= 90);
      avgConfidence = (pEmiConf + pNumNConf + pDatEConf + pValTConf + pValLConf) / 5;
    } else {
      hospital = detectHospitalName(extractedText || resultData.summary || "");
      const principalEtiqueta = resultData?.etiquetas?.[0] || {};
      extracted_data = {
        nome_paciente: principalEtiqueta.nome_paciente || resultData.nome_paciente || "",
        numero_atendimento: principalEtiqueta.numero_atendimento || resultData.numero_atendimento || "",
        convenio: principalEtiqueta.convenio || resultData.convenio || "",
        data_atendimento: principalEtiqueta.data_atendimento || resultData.data_atendimento || ""
      };
      
      criticalsComplete = isFieldComplete(extracted_data.nome_paciente) &&
                          isFieldComplete(extracted_data.numero_atendimento) &&
                          isFieldComplete(extracted_data.convenio) &&
                          isFieldComplete(extracted_data.data_atendimento);
                          
      const pNomConf = typeof resultData.nome_paciente_confidence === "number" ? resultData.nome_paciente_confidence : (typeof principalEtiqueta.nome_paciente_confidence === "number" ? principalEtiqueta.nome_paciente_confidence : 0);
      const pNumConf = typeof resultData.numero_atendimento_confidence === "number" ? resultData.numero_atendimento_confidence : (typeof principalEtiqueta.numero_atendimento_confidence === "number" ? principalEtiqueta.numero_atendimento_confidence : 0);
      const pConConf = typeof resultData.convenio_confidence === "number" ? resultData.convenio_confidence : (typeof principalEtiqueta.convenio_confidence === "number" ? principalEtiqueta.convenio_confidence : 0);
      const pHosConf = typeof resultData.hospital_confidence === "number" ? resultData.hospital_confidence : (typeof principalEtiqueta.hospital_confidence === "number" ? principalEtiqueta.hospital_confidence : 0);
      
      auto_confidence_ok = (pNomConf >= 90) && (pNumConf >= 90) && (pConConf >= 90) && (pHosConf >= 90);
      avgConfidence = (
        (resultData.nome_paciente_confidence || 100) +
        (resultData.numero_atendimento_confidence || 100) +
        (resultData.convenio_confidence || 100)
      ) / 3;
    }

    const confidence = avgConfidence >= 75 ? "high" : "low";

    const shouldAutoVerify = criticalsComplete;
    const verified_by_user = shouldAutoVerify ? true : false;

    const docId = db.collection("learned_examples").doc().id;

    const existingRef = await db.collection("learned_examples").where("image_hash", "==", image_hash).limit(1).get();
    if (!existingRef.empty) {
      console.log(`[Learned DB] Example with image_hash ${image_hash} already exists. Skipping.`);
      return;
    }

    await db.collection("learned_examples").doc(docId).set({
      id: docId,
      hospital,
      image_hash,
      documentType: docType,
      extracted_data,
      confidence,
      auto_confidence_ok,
      corrected_by_user: false,
      correction_checked_at: null,
      verified_by_user,
      created_at: dbServerTimestamp()
    });

    console.log(`[Learned DB] Automatically saved learned example for ${hospital} (${docType}) with confidence ${confidence}. Auto-promotion eligible: ${auto_confidence_ok}. Auto-verified: ${verified_by_user}`);
  } catch (err) {
    console.error("[Learned DB] Error saving learned example:", err);
  }
}

async function promoteAutoVerifiedExamples() {
  try {
    const db = getDB();
    const snap = await db.collection("learned_examples")
      .where("verified_by_user", "==", false)
      .where("auto_confidence_ok", "==", true)
      .where("corrected_by_user", "==", false)
      .get();

    if (snap.empty) {
      return;
    }

    let promotedCount = 0;
    const batch = db.batch();
    const now = Date.now();
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;

    snap.docs.forEach(doc => {
      const data = doc.data();
      const createdAt = data.created_at;
      
      let createdTimeMs = 0;
      if (createdAt && typeof createdAt.toMillis === "function") {
        createdTimeMs = createdAt.toMillis();
      } else if (createdAt && createdAt.seconds) {
        createdTimeMs = createdAt.seconds * 1000;
      } else if (createdAt instanceof Date) {
        createdTimeMs = createdAt.getTime();
      } else if (typeof createdAt === "string") {
        createdTimeMs = new Date(createdAt).getTime();
      } else if (typeof createdAt === "number") {
        createdTimeMs = createdAt;
      }

      if (createdTimeMs && (now - createdTimeMs >= fortyEightHoursMs)) {
        batch.update(doc.ref, {
          verified_by_user: true,
          promoted_automatically: true,
          promoted_at: dbServerTimestamp()
        });
        promotedCount++;
      }
    });

    if (promotedCount > 0) {
      await batch.commit();
      console.log(`[Promotion System] Automatically promoted ${promotedCount} high-confidence examples to verified=true after 48h elapsed.`);
    }
  } catch (err) {
    console.error("[Promotion System Exception] Failed to run promoteAutoVerifiedExamples:", err);
  }
}

let extractRequestCount = 0;
let analyzeRequestCount = 0;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.V2_Gemini_API_Key || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("A variável de ambiente Gemini V2_Gemini_API_Key ou GEMINI_API_KEY não está configurada.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Keep track of which keys are currently depleted of limits or credits to automatically route around them dynamically.
const keyDepletionStatus: Record<string, { depleted: boolean; lastChecked: number }> = {
  V2_Gemini_API_Key: { depleted: false, lastChecked: 0 },
  GEMINI_API_KEY: { depleted: false, lastChecked: 0 },
  GEMINI_API_KEY_PAID: { depleted: false, lastChecked: 0 }
};

// If a key has been marked as depleted for more than 5 minutes, we allow retrying it to handle credit refills or billing updates.
function isKeyDepleted(keyName: string): boolean {
  const status = keyDepletionStatus[keyName];
  if (!status || !status.depleted) return false;
  
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - status.lastChecked > fiveMinutes) {
    status.depleted = false; // Reset to retry after 5 mins
    return false;
  }
  return true;
}

function markKeyDepleted(keyName: string) {
  keyDepletionStatus[keyName] = { depleted: true, lastChecked: Date.now() };
}

async function generateGeminiContentWithRetry(
  modelName: string,
  contents: any,
  systemInstruction?: string,
  responseMimeType?: string,
  responseSchema?: any
): Promise<{ text: string; usedModel: string; usedKey: string; quotaExhausted?: boolean }> {
  // Map prohibited models to valid ones
  const modelMap: Record<string, string> = {
    'gemini-1.5-flash': 'gemini-flash-latest',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-3-flash-preview': 'gemini-flash-latest',
    'gemini-pro': 'gemini-3.1-pro-preview'
  };

  const actualModelName = modelMap[modelName] || modelName;

  // Primary key candidates: GEMINI_API_KEY, falling back to V2_Gemini_API_Key
  const primaryKeyName = process.env.GEMINI_API_KEY ? "GEMINI_API_KEY" : (process.env.V2_Gemini_API_Key ? "V2_Gemini_API_Key" : "GEMINI_API_KEY");
  const primaryKeyValue = process.env.GEMINI_API_KEY || process.env.V2_Gemini_API_Key;

  const keysToTry: { name: string; value: string | undefined }[] = [
    { name: primaryKeyName, value: primaryKeyValue },
    { name: "GEMINI_API_KEY_PAID", value: process.env.GEMINI_API_KEY_PAID }
  ];

  const validKeys = keysToTry.filter(k => !!k.value);
  if (validKeys.length === 0) {
    throw new Error("A chave Gemini não está configurada no ambiente (GEMINI_API_KEY ou GEMINI_API_KEY_PAID).");
  }

  // Filter keys that are not marked as depleted. If all configured keys are marked depleted, allow trying any of them.
  let keysToAttempt = validKeys.filter(k => !isKeyDepleted(k.name));
  if (keysToAttempt.length === 0) {
    keysToAttempt = validKeys;
  }

  let lastError: any = null;

  for (const k of keysToAttempt) {
    const keyName = k.name;
    const apiKey = k.value!;

    try {
      console.log(`[Gemini Retry Service] Tentando chamada utilizando chave: ${keyName}, modelo: ${actualModelName}...`);
      const ai = new GoogleGenAI({ 
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Ensure contents is in the correct format { parts: [...] } or [{ role: 'user', parts: [...] }]
      let formattedContents: any = contents;
      
      // If it's the [filePart, promptPart] array from extraction
      if (Array.isArray(contents)) {
        if (contents.length > 0 && !contents[0].role) {
          // Just parts
          formattedContents = { parts: contents.map(p => typeof p === 'string' ? { text: p } : p) };
        }
      } else if (typeof contents === 'string') {
        formattedContents = { parts: [{ text: contents }] };
      }

      const result = await ai.models.generateContent({
        model: actualModelName,
        contents: formattedContents,
        config: {
          systemInstruction,
          responseMimeType,
          responseSchema
        }
      });

      const text = result.text;

      if (text !== undefined) {
        console.log(`[Gemini Retry Service] Sucesso utilizando a chave ${keyName} e modelo ${actualModelName}!`);
        return {
          text: text,
          usedModel: actualModelName,
          usedKey: keyName,
          quotaExhausted: keyName === "GEMINI_API_KEY_PAID"
        };
      }
      throw new Error(`Nenhum texto retornado do modelo ${actualModelName} usando a chave ${keyName}.`);
    } catch (err: any) {
      lastError = err;
      const errStr = String(err.message || err || "").toLowerCase();
      const isDepletion = errStr.includes("429") || errStr.includes("depleted") || errStr.includes("exhausted") || errStr.includes("quota");
      const is503 = errStr.includes("503") || errStr.includes("unavailable") || errStr.includes("high demand") || errStr.includes("temporary");
      
      if (is503 && actualModelName !== "gemini-flash-latest") {
        console.warn(`[Gemini Retry Service] Modelo ${actualModelName} retornou indisponível (503). Acionando contingência imediata: alternando para gemini-flash-latest...`);
        return generateGeminiContentWithRetry(
          "gemini-flash-latest",
          contents,
          systemInstruction,
          responseMimeType,
          responseSchema
        );
      }

      if (isDepletion) {
        console.warn(`[Gemini Circuit Breaker] Chave ${keyName} retornou exaustão de cota/saldo. Marcando como temporariamente desativada.`);
        markKeyDepleted(keyName);
      } else {
        console.warn(`[Gemini Retry Service] Falha utilizando a chave ${keyName} e modelo ${actualModelName}:`, err.message || err);
      }
    }
  }

  // If we exited the loop, it means all tried keys failed.
  // Check if the last error was a quota/depletion error
  const errStr = lastError ? String(lastError.message || lastError || "").toLowerCase() : "";
  const isDepletion = errStr.includes("429") || errStr.includes("depleted") || errStr.includes("exhausted") || errStr.includes("quota");

  if (isDepletion) {
    const quotaError = new Error("Cota de processamento esgotada. Tente novamente mais tarde.");
    (quotaError as any).status = 429;
    throw quotaError;
  }

  throw lastError || new Error("Erro desconhecido ao processar requisição no Gemini.");
}

function getHeuristicFallback(filename: string, expectedType: string): any {
  throw new Error("Não foi possível extrair os dados desta imagem, tente novamente ou insira manualmente");
}

function parseBrazilianDecimal(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === "number") return val;
  if (typeof val !== "string") return Number(val) || 0;
  
  // Clean string val
  let clean = val.replace(/r\$\s*/gi, "").trim();
  // If it contains dots and a comma (e.g. 1.500,00)
  if (clean.includes(".") && clean.includes(",")) {
    // Remove dots (thousands separators) and replace comma with dot
    clean = clean.replace(/\./g, "").replace(/,/g, ".");
  } else if (clean.includes(",")) {
    // If it contains only a comma (e.g. 1500,00)
    clean = clean.replace(/,/g, ".");
  }
  
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeExtractionData(resultData: any): any {
  if (!resultData) return { etiquetas: [] };
  console.log('--- RAW EXTRACTION DATA ---');
  console.log(JSON.stringify(resultData, null, 2));
  console.log('DOCUMENT TYPE ORIGINAL:', resultData.documentType);
  
  const docType = String(resultData.documentType || "").toLowerCase().trim();
  const isNotaFiscal = docType === "nota_fiscal" || docType === "nota fiscal" || docType === "fatura" || docType === "recibo";
  
  // Guard specifically for corporate invoices to preserve exact schema elements with no label-strip/overwriting
  if (isNotaFiscal && 
      (resultData.numeroNota || resultData.valorTotal || resultData.emitente)) {
    if (!resultData.etiquetas) resultData.etiquetas = [];
    const emitenteVal = resultData.emitente || resultData.emitente_servicos || resultData.tomador || resultData.razao_social || resultData.hospital;
    resultData.emitente = emitenteVal ? String(emitenteVal).trim() : "";

    const cnpjVal = resultData.cnpjEmitente || resultData.cnpj_emitente || resultData.cnpj_tomador || resultData.cnpjTomador;
    resultData.cnpjEmitente = cnpjVal ? String(cnpjVal).trim() : "";

    const numeroNotaVal = resultData.numeroNota || resultData.numero_nota || resultData.num_nota || resultData.numero;
    resultData.numeroNota = numeroNotaVal ? String(numeroNotaVal).trim() : "";

    const dataEmissaoVal = resultData.dataEmissao || resultData.data_emissao || resultData.data_de_emissao || resultData.data;
    resultData.dataEmissao = dataEmissaoVal ? String(dataEmissaoVal).trim() : "";

    const valorTotalVal = resultData.valorTotal || resultData.valor_total || resultData.valorTotalServicos || resultData.valor_total_servicos || resultData.valor_servicos;
    resultData.valorTotal = parseBrazilianDecimal(valorTotalVal);

    const valorLiquidoVal = resultData.valorLiquido || resultData.valor_liquido || resultData.valorLiquidoServicos || resultData.valor_liquido_faturado;
    resultData.valorLiquido = valorLiquidoVal ? parseBrazilianDecimal(valorLiquidoVal) : (resultData.valorTotal || 0);

    if (!resultData.itens || !Array.isArray(resultData.itens)) {
      resultData.itens = [];
    }
    return resultData;
  }
  
  // Ensure we have an etiquetas array
  if (!resultData.etiquetas || !Array.isArray(resultData.etiquetas)) {
    resultData.etiquetas = [];
  }
  
  // Clean root level convenio to inherit if needed
  const rootConvenio = resultData.convenio;
  let cleanRootConvenio = "";
  if (typeof rootConvenio === "string") {
    cleanRootConvenio = rootConvenio.trim().toUpperCase();
    if (cleanRootConvenio === "---" || cleanRootConvenio === "N/A" || cleanRootConvenio === "VAZIO" || cleanRootConvenio === "OUTROS" || cleanRootConvenio === "OUTRO") {
      cleanRootConvenio = "";
    }
  }

  // If the root object itself has extraction fields, push it to the etiquetas array as the first element if etiquetas is empty
  const rootPatientName = resultData.nome_paciente || resultData.paciente;
  const rootAtendimento = resultData.numero_atendimento || resultData.atendimento;
  const rootData = resultData.data_atendimento || resultData.dataAtendimento;
  
  if (rootPatientName || rootAtendimento) {
    // Check if it's already in the tags
    const alreadyExists = resultData.etiquetas.some((et: any) => {
      const etName = et.nome_paciente || et.paciente;
      const etAtend = et.numero_atendimento || et.atendimento;
      return etName === rootPatientName || etAtend === rootAtendimento;
    });
    
    if (!alreadyExists) {
      resultData.etiquetas.unshift({
        nome_paciente: rootPatientName,
        numero_atendimento: rootAtendimento,
        data_atendimento: rootData,
        convenio: rootConvenio
      });
    }
  }
  
  // Now, map/normalize each element inside the etiquetas array
  resultData.etiquetas = resultData.etiquetas.map((et: any) => {
    // 1. Get raw values
    let rawNome = et.nome_paciente || et.paciente || "";
    let rawAtendimento = et.numero_atendimento || et.atendimento || "";
    let rawDataStr = et.data_atendimento || et.dataAtendimento || "";
    let rawConvenio = et.convenio || "";
    let rawHospital = et.hospital || "";
    
    // 2. Data Isolation Filter (Anti-contamination rule/regex for nome_paciente)
    if (typeof rawNome === "string") {
      let cleanedNome = rawNome;
      
      // Clean up contaminated substrings
      cleanedNome = cleanedNome.replace(/(?:m[eé]dico|\bdr\b\.?|assistente\s+social|senha\s+qc[^\s]*)/gi, "");
      // Clean up any extra slashes, hyphens, or spaces left
      cleanedNome = cleanedNome.replace(/^[-\/\s]+|[-\/\s]+$/g, "").replace(/\s+/g, " ");
      
      const isPureContaminant = /^(?:m[eé]dico|social|senha|vazio|n\/a|---\s*)$/i.test(cleanedNome.trim());
      if (isPureContaminant || !cleanedNome.trim()) {
        cleanedNome = "";
      }
      
      rawNome = cleanedNome.trim().toUpperCase();
    }
    
    // 3. Normalize other fields
    if (typeof rawAtendimento !== "string") {
      rawAtendimento = rawAtendimento ? String(rawAtendimento) : "";
    }
    rawAtendimento = rawAtendimento.trim();
    
    if (typeof rawConvenio === "string") {
      rawConvenio = rawConvenio.trim().toUpperCase();
    }
    // Inherit from root level if individual is empty/---/null
    if (!rawConvenio || rawConvenio === "---" || rawConvenio === "VAZIO" || rawConvenio === "N/A") {
      if (cleanRootConvenio) {
        rawConvenio = cleanRootConvenio;
      }
    }
    
    if (typeof rawHospital === "string") {
      rawHospital = rawHospital.trim().toUpperCase();
    }
    
    let rawDataJoined = "";
    if (typeof rawDataStr === "string") {
      rawDataJoined = rawDataStr.trim();
    } else if (rawDataStr && typeof rawDataStr === "object") {
      rawDataJoined = JSON.stringify(rawDataStr);
    }
    
    if (rawDataJoined === "12/05/2026") {
      rawDataJoined = ""; // Explicitly clear any lingering default date
    }
    
    // Return precisely the unified structured object with exact keys:
    // nome_paciente, numero_atendimento, data_atendimento, convenio, hospital
    return {
      nome_paciente: rawNome || "---",
      numero_atendimento: rawAtendimento || "---",
      data_atendimento: rawDataJoined || "", // Removed default "12/05/2026"
      convenio: rawConvenio || "---",
      hospital: rawHospital || "---"
    };
  });
  
  // Filter out completely empty items just in case
  resultData.etiquetas = resultData.etiquetas.filter((et: any) => {
    return et.nome_paciente !== "---" || et.numero_atendimento !== "---";
  });
  
  // Set the root level fields to the first element in labels array, if present, for compatibility
  if (resultData.etiquetas.length > 0) {
    const mainEt = resultData.etiquetas[0];
    resultData.nome_paciente = mainEt.nome_paciente;
    resultData.numero_atendimento = mainEt.numero_atendimento;
    resultData.data_atendimento = mainEt.data_atendimento;
    resultData.convenio = mainEt.convenio;
    resultData.hospital = mainEt.hospital;
  }
  
  return resultData;
}

function getHeuristicAnalysis(fileName: string, prompt: string): string {
  const normName = (fileName || "").toLowerCase();
  const normPrompt = (prompt || "").toLowerCase();

  const disclaimer = `⚠️ **[MENSAGEM EM MODO DE CONTINGÊNCIA - CRÉDITOS GEMINI ZERADOS (429)]**  
*Sua chave do Google AI Studio está sem saldo ou limite pré-pago ativo. Para fins de testes e homologação, o auditor cognitivo DocEngine processou a pergunta heuristicamente usando o contexto dos documentos padrão do sistema.*

---

`;

  if (normPrompt.includes("sandra") || normPrompt.includes("45013") || normPrompt.includes("ressonância") || normPrompt.includes("ressonancia")) {
    return disclaimer + `### Relatório Clínico-Auditado: Glosa de Sandra Regina Souza (Atendimento: 45013)

Prezado Auditor, analisamos o histórico e o prontuário digital relacionados ao atendimento **45013** da paciente **Sandra Regina Souza** referente ao exame **Ressonância Magnética do Joelho Dir.**:

1. **Motivo da Glosa:** Rejeição integral do repasse de **R$ 4.200,00** por parte do Hospital Geral Aliança.
2. **Causa Detalhada:** Ausência do anexo de justificativa médica obrigatória de elegibilidade ou laudo de indicação clínica prévia durante a transmissão da fatura.
3. **Cruzamento de Contrato:** O *Contrato Vigente 2026 (Coparticipacao)* exige cobertura técnica e aprovação prévia para exames de alta complexidade (Grupo SADT-Alta-Altíssima).
4. **Recomendação Operacional:**
   - Obter o laudo assinado pelo médico assistente justificando a urgência/relevância do exame.
   - Anexar o laudo à fatura em formato PDF no sistema.
   - Entrar com o recurso administrativo (Recurso de Glosa) sob o código de cobertura complementar do Bradesco Saúde.`;
  }

  if (normPrompt.includes("contrato") || normPrompt.includes("coparticipação") || normPrompt.includes("faturamento") || normPrompt.includes("recorrente") || normPrompt.includes("regras") || normPrompt.includes("coparticipacao")) {
    return disclaimer + `### Análise de Diretrizes Contratuais (Contrato_Vigente_Coparticipacao2026.pdf)

Baseado nas cláusulas do contrato padrão carregado no DocEngine:

1. **Parâmetros de Coparticipação:**
   - Consultas eletivas em regime de Pronto-Atendimento possuem desconto de 10% a 20% do valor de repasse.
   - Exames cardiológicos comuns (eletrocardiograma etc.) estão inclusos no pacote padrão sem glosas contratuais.
   - Procedimentos de alta complexidade (Exames de Imagem, Órteses e Próteses de Artroscopia - OPME) exigem **pré-autorização eletrônica com código de validação de token**.
2. **Glosa de Taxas de Sala:**
   - As taxas de sala e taxas administrativas não declaradas expressamente no Anexo IV são consideradas inválidas e passíveis de glosa imediata (glosa técnica automática).
3. **Limiares Definidos:**
   - Limite de similaridade aceitável para processamento de nomes de pacientes: **95% (Máximo)** nos sistemas de reconciliação de guias. Valor padrão recomendado para auditorias cruzadas redundantes.`;
  }

  if (normPrompt.includes("total") || normPrompt.includes("pago") || normPrompt.includes("divergência") || normPrompt.includes("resumo") || normPrompt.includes("divergencia")) {
    return disclaimer + `### Resumo Financeiro Consolidado da Auditoria

Análise heurística de faturamento para o lote carregado:

- **Total Faturado de Lote:** R$ 19.400,00
- **Total Efetivamente Pago:** R$ 11.750,00
- **Montante de Glosas Ativas (Divergência):** R$ 7.650,00
- **Índice de Glosa:** 39.4% (Acima da média saudável do setor hospitalar, que é de 12%).
  
**Principais Gargalos Detectados:**
1. **Glosa Integral (R$ 4.200,00)** por falta de auditoria de exames de alta complexidade (Sandra Regina Souza).
2. **Glosa Parcial (R$ 600,00)** por insumos especiais e OPME de ortopedia sem cobertura prevista no anexo de tabelas (Roberta Nascimento).
3. **Glosa Integral (R$ 950,00)** em Fisioterapia aguardando envio de relatório sob análise técnica (José Fernandes).`;
  }

  // General fallback text
  return disclaimer + `### Resposta do Auditor Assistente DocEngine

Analisamos a sua pergunta em relação ao arquivo **${fileName}**:

- **Análise do Documento:** O arquivo está indexado e faz parte dos metadados de simulação do DocEngine.
- **Detecção de Regras:** Identificamos que as glosas deste lote acontecem predominantemente por desconformidade de códigos de faturamento frente ao contrato principal de coparticipação 2026.
- **Ação sugerida:** Execute a conciliação completa clicando no botão **Iniciar Nova Conciliação** na tela inicial para atualizar a tabela geral de divergências e os logs de auditoria.`;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // 1. PRIMEIRO MIDDLEWARE: Responder imediatamente ao OPTIONS (preflight) com 200 e headers corretos
  app.options('*', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-api-key, Authorization, Accept, Origin, Access-Control-Allow-Origin');
    res.status(200).end();
  });

  // 2. SEGUNDO MIDDLEWARE: Garantir que todas as requisições normais também tenham o header de CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS, PATCH, HEAD');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-api-key, Access-Control-Allow-Origin');
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });

  // CORS nativo adicional como redundância
  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
    allowedHeaders: ["Content-Type", "Authorization", "x-api-key", "Accept", "Origin", "Access-Control-Allow-Origin"],
  }));

  // Body limits
  app.use(express.json({ limit: '500mb' }));
  app.use(express.urlencoded({ limit: '500mb', extended: true }));

  // Health check route pública
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      version: "2.0.0",
      name: "DocEngine API (V2) - AI Studio Hosted",
      timestamp: new Date().toISOString()
    });
  });

  // Keep-alive resource para ping externo (evitar cold-start)
  app.get("/api/keepalive", (req, res) => {
    res.json({
      connected: true,
      time: new Date().toISOString(),
      message: "Agent is awake and connection is active."
    });
  });

  // Manifesto de rotas para autodescoberta do MedReconcile / satélites
  const routesManifest = {
    success: true,
    app: "Audit IA - Core Server",
    version: "2.0.0",
    description: "API Router and Manifest for Satellite Discovery",
    endpoints: {
      public: [
        {
          path: "/api/health",
          method: "GET",
          description: "Verifica integridade do servidor."
        },
        {
          path: "/api/keepalive",
          method: "GET",
          description: "Mantém o servidor ativo sem cold-starts."
        },
        {
          path: "/api/routes",
          method: "GET",
          description: "Retorna o manifesto de todas as rotas e endpoints (autodescoberta)."
        },
        {
          path: "/api/manifest",
          method: "GET",
          description: "Alias amigável para /api/routes."
        },
        {
          path: "/public/extract",
          method: "POST",
          description: "Extração pública direta de etiquetas/relatórios com suporte a MOCK_MODE."
        }
      ],
      protected: [
        {
          path: "/api/gemini/extract",
          method: "POST",
          description: "Extração integrada via IA. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/gemini/analyze",
          method: "POST",
          description: "Análise geral de relatórios e faturamento via IA. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/ai-test",
          method: "GET",
          description: "Validação de chaves/diagnóstico de IA. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/read",
          method: "USE",
          description: "Roteador interno para leitura de planilhas e banco de regras. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/compare",
          method: "USE",
          description: "Roteador interno para comparação de tabelas/regras. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/calculate",
          method: "USE",
          description: "Roteador interno de repasses e faturamento. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/audit",
          method: "USE",
          description: "Roteador interno de gerenciamento de auditorias e conciliações. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/history",
          method: "USE",
          description: "Históricos e registros auditados. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/reconcile",
          method: "USE",
          description: "Execução direta e logs de conciliação. Requer x-api-key.",
          headers: ["x-api-key"]
        },
        {
          path: "/api/external",
          method: "USE",
          description: "Mapeamento externo complementar. Requer x-api-key.",
          headers: ["x-api-key"]
        }
      ]
    }
  };

  app.get("/api/routes", (req, res) => {
    res.json(routesManifest);
  });

  app.get("/api/manifest", (req, res) => {
    res.json(routesManifest);
  });

  // Direct Extraction endpoint using direct Gemini with model redundancy and Groq OCR fallback

  // Diagnostics connection test endpoint to see if Gemini and Groq are ready and valid
  app.get("/api/ai-test", async (req, res) => {
    console.log("[AI Test] Iniciando verificação de conectividade...");
    const results: any = {
      timestamp: new Date().toISOString(),
      gemini: { status: "pending", error: null, response: "", durationMs: 0, statusCode: 200 },
      groq: { status: "pending", error: null, response: "", durationMs: 0, statusCode: 200 }
    };

    try {
      const geminiStart = Date.now();
      const testModels = ["gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
      let result = null;
      let lastErr = null;
      for (const m of testModels) {
        try {
          console.log(`[AI Test] Testando canal Gemini com o modelo: ${m}`);
          result = await generateGeminiContentWithRetry(
            m,
            "Responda apenas com a palavra OK se estiver recebendo esta mensagem."
          );
          if (result && result.text) {
            break;
          }
        } catch (err: any) {
          console.warn(`[AI Test] Falha com modelo ${m}: ${err.message || err}`);
          lastErr = err;
        }
      }

      results.gemini.durationMs = Date.now() - geminiStart;
      if (result && result.text) {
        results.gemini.status = "connected";
        results.gemini.response = `${result.text.trim()} (via ${result.usedKey})`;
        results.gemini.statusCode = 200;
      } else {
        results.gemini.status = "failed";
        results.gemini.error = lastErr ? (lastErr.message || "Erro Gemini") : "Nenhum texto retornado do modelo.";
        results.gemini.statusCode = lastErr ? (lastErr.status || 500) : 204;
      }

      // Test Groq
      const groqStart = Date.now();
      const groqApiKey = process.env.GROQ_API_KEY;
      if (!groqApiKey) {
        results.groq.status = "failed";
        results.groq.error = "GROQ_API_KEY ausente";
        results.groq.statusCode = 401;
      } else {
        try {
          console.log("[AI Test] Testando Groq...");
          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{ role: "user", content: "Responda apenas OK" }],
              max_tokens: 5
            })
          });

          results.groq.durationMs = Date.now() - groqStart;
          results.groq.statusCode = groqResponse.status;

          if (!groqResponse.ok) {
            const errorBody = await groqResponse.text();
            results.groq.status = "failed";
            results.groq.error = `Erro Groq: ${groqResponse.status}`;
          } else {
            const groqData = await groqResponse.json();
            results.groq.status = "connected";
            results.groq.response = groqData.choices?.[0]?.message?.content?.trim() || "OK";
          }
        } catch (err: any) {
          console.error("[AI Test] Erro Groq:", err.message);
          results.groq.status = "failed";
          results.groq.error = "Erro Groq";
          results.groq.statusCode = 500;
        }
      }

      const overallSuccess = results.gemini.status === "connected" || results.groq.status === "connected";
      console.log("[AI Test] Concluído. Sucesso:", overallSuccess);
      
      return res.status(200).json({
        success: overallSuccess,
        results: results
      });

    } catch (routeErr: any) {
      console.error("[AI Test] Falha crítica na rota:", routeErr);
      return res.status(500).json({
        success: false,
        error: routeErr.message,
        results: results
      });
    }
  });

  // --- Incremental Learning API Routes ---
  app.get("/api/learning/stats", async (req, res) => {
    try {
      const db = getDB();
      const examplesSnap = await db.collection("learned_examples").get();
      
      const total_examples = examplesSnap.size;
      const by_hospital: { [key: string]: number } = {};
      const by_hospital_etiqueta: { [key: string]: number } = {};
      const by_hospital_nota_fiscal: { [key: string]: number } = {};
      
      examplesSnap.forEach(doc => {
        const d = doc.data();
        if (d.verified_by_user === true && d.corrected_by_user === false) {
          const hosp = d.hospital || "Outro";
          const docType = String(d.documentType || "etiqueta_hospitalar").toLowerCase().trim();
          
          if (docType === "nota_fiscal") {
            by_hospital_nota_fiscal[hosp] = (by_hospital_nota_fiscal[hosp] || 0) + 1;
          } else {
            by_hospital_etiqueta[hosp] = (by_hospital_etiqueta[hosp] || 0) + 1;
            by_hospital[hosp] = (by_hospital[hosp] || 0) + 1; // Backwards compatibility
          }
        }
      });

      // Get last 7 days logs
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      let gemini_calls_last_7d = 0;
      let local_cache_hits_last_7d = 0;

      try {
        const logsSnap = await db.collection("learning_logs")
          .where("timestamp", ">=", sevenDaysAgo)
          .get();

        logsSnap.forEach(doc => {
          const d = doc.data();
          if (d.provider === "local_cache") {
            local_cache_hits_last_7d++;
          } else {
            gemini_calls_last_7d++;
          }
        });
      } catch (logErr) {
        console.warn("[Stats Log Query] Falha ao consultar learning_logs (talvez vazia):", logErr);
      }

      return res.status(200).json({
        success: true,
        total_examples,
        by_hospital,
        by_hospital_etiqueta,
        by_hospital_nota_fiscal,
        gemini_calls_last_7d,
        local_cache_hits_last_7d
      });
    } catch (err: any) {
      console.error("[Stats Error]", err);
      return res.status(200).json({
        success: false,
        error: "Erro de permissão ou conexão no Firestore para a coleção de estatísticas.",
        total_examples: 0,
        by_hospital: {},
        by_hospital_etiqueta: {},
        by_hospital_nota_fiscal: {},
        gemini_calls_last_7d: 0,
        local_cache_hits_last_7d: 0,
        code: err.message?.includes("Missing or insufficient permissions") ? "firestore/permission-denied" : "generic"
      });
    }
  });

  app.get("/api/learning/examples", async (req, res) => {
    try {
      const db = getDB();
      const snap = await db.collection("learned_examples")
        .orderBy("created_at", "desc")
        .limit(100)
        .get();

      const examples: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        let formattedCreatedAt = d.created_at;
        if (d.created_at?.toDate) {
          formattedCreatedAt = d.created_at.toDate().toISOString();
        }
        examples.push({
          ...d,
          created_at: formattedCreatedAt
        });
      });

      return res.status(200).json({
        success: true,
        examples
      });
    } catch (err: any) {
      console.error("[Examples Error]", err);
      return res.status(200).json({
        success: false,
        error: "Erro de permissão ou conexão no Firestore para a lista de exemplos.",
        examples: [],
        code: err.message?.includes("Missing or insufficient permissions") ? "firestore/permission-denied" : "generic"
      });
    }
  });

  app.post("/api/learning/examples/:id/verify", async (req, res) => {
    try {
      const { id } = req.params;
      const { extracted_data, action } = req.body;
      const db = getDB();

      const docRef = db.collection("learned_examples").doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ success: false, error: "Exemplo não encontrado." });
      }

      if (action === "delete") {
        await docRef.delete();
        console.log(`[Learned DB] Deleted example ${id}`);
        return res.status(200).json({ success: true, message: "Exemplo excluído com sucesso." });
      }

      const docType = String(docSnap.data()?.documentType || "etiqueta_hospitalar").toLowerCase().trim();
      const isNotaFiscal = docType === "nota_fiscal";

      const updateData: any = {
        verified_by_user: true,
        confidence: "high"
      };

      if (extracted_data) {
        if (isNotaFiscal) {
          updateData.extracted_data = {
            emitente: extracted_data.emitente || "",
            cnpjEmitente: extracted_data.cnpjEmitente || "",
            valorTotal: parseBrazilianDecimal(extracted_data.valorTotal),
            valorLiquido: parseBrazilianDecimal(extracted_data.valorLiquido),
            numeroNota: extracted_data.numeroNota || "",
            dataEmissao: extracted_data.dataEmissao || ""
          };
          if (extracted_data.emitente) {
            updateData.hospital = extracted_data.emitente;
          }
        } else {
          updateData.extracted_data = {
            nome_paciente: extracted_data.nome_paciente?.toUpperCase() || "",
            numero_atendimento: extracted_data.numero_atendimento || "",
            convenio: extracted_data.convenio?.toUpperCase() || "",
            hospital: extracted_data.hospital?.toUpperCase() || "",
            data_atendimento: extracted_data.data_atendimento || ""
          };
          if (extracted_data.hospital) {
            updateData.hospital = extracted_data.hospital;
          }
        }
      }

      await docRef.update(updateData);
      console.log(`[Learned DB] Verified example ${id} (${docType}) successfully`);

      return res.status(200).json({ success: true, message: "Exemplo verificado com sucesso." });
    } catch (err: any) {
      console.error("[Verify Error]", err);
      return res.status(200).json({
        success: false,
        error: "Erro de permissão ou conexão no Firestore para verificar o exemplo.",
        code: err.message?.includes("Missing or insufficient permissions") ? "firestore/permission-denied" : "generic"
      });
    }
  });

  // Mark corrected endpoint for MedNote and MedReconcile
  app.post("/api/learned-examples/mark-corrected", async (req, res) => {
    try {
      const { image_hash } = req.body;
      if (!image_hash) {
        return res.status(400).json({ success: false, error: "O campo image_hash é obrigatório no corpo da requisição." });
      }

      const db = getDB();
      const snaps = await db.collection("learned_examples").where("image_hash", "==", image_hash).limit(1).get();

      if (snaps.empty) {
        return res.status(404).json({ success: false, error: "Exemplo com este image_hash não encontrado." });
      }

      const docId = snaps.docs[0].id;
      await db.collection("learned_examples").doc(docId).update({
        corrected_by_user: true,
        correction_checked_at: dbServerTimestamp()
      });

      console.log(`[Learned DB] Example with image_hash ${image_hash} (doc: ${docId}) marked as corrected_by_user=true.`);

      return res.status(200).json({ success: true, message: "Exemplo marcado como corrigido pelo usuário com sucesso." });
    } catch (err: any) {
      console.error("[Learned DB Mark Corrected User Error]", err);
      return res.status(200).json({
        success: false,
        error: "Erro de permissão ou conexão no Firestore: " + err.message,
        code: err.message?.includes("Missing or insufficient permissions") ? "firestore/permission-denied" : "generic"
      });
    }
  });

  // --- API Middleware from Migrated Functions ---
  // Mount logic under /api
  const apiRouter = express.Router();
  
  // Debug log for all /api requests
  apiRouter.use((req, res, next) => {
    console.log(`[API Debug] ${req.method} ${req.url} (Path: ${req.path})`);
    next();
  });

  // We use the same middlewares
  apiRouter.use(logMiddleware);
  apiRouter.use(authMiddleware);

  // Helper to handle ESM/CJS interop for routers
  const getRouter = (r: any, name: string) => {
    const routerFn = r.default || r;
    if (!routerFn || typeof routerFn !== "function") {
      console.error(`[Aviso Crítico] O roteador de '${name}' não exportou uma função de middleware válida. Import recebido:`, r);
    }
    return routerFn;
  };

  apiRouter.use("/read",       getRouter(readRoute, "read"));
  apiRouter.use("/compare",    getRouter(compareRoute, "compare"));
  apiRouter.use("/calculate",  getRouter(calculateRoute, "calculate"));
  apiRouter.use("/audit",      getRouter(auditRoute, "audit"));
  apiRouter.use("/history",    getRouter(historyRoute, "history"));
  apiRouter.use("/train",      getRouter(trainRoute, "train"));
  apiRouter.use("/keys",       getRouter(keysRoute, "keys"));
  apiRouter.use("/reconcile",  getRouter(reconcileRoute, "reconcile"));
  apiRouter.use("/external",   getRouter(externalRoute, "external"));

  apiRouter.get("/learning/format-candidates", async (req, res) => {
    try {
      const limitVal = parseInt(req.query.limit as string) || 20;
      const offsetVal = parseInt(req.query.offset as string) || 0;

      const queryProxy = getDB().collection("format_candidates");
      const snap = await queryProxy.orderBy("createdAt", "desc").get();
      
      const total = snap.docs.length;
      const candidates = snap.docs.slice(offsetVal, offsetVal + limitVal).map(d => d.data());

      return res.status(200).json({
        success: true,
        total,
        limit: limitVal,
        offset: offsetVal,
        candidates
      });
    } catch (err: any) {
      console.error("[GET /learning/format-candidates] Error:", err);
      return res.status(500).json({ error: "Erro ao buscar candidatos a formatos", details: err.message });
    }
  });

  apiRouter.get("/learning/format-candidates/pending", async (req, res) => {
    try {
      const snap = await getDB().collection("format_candidates").get();
      const allDocs = snap.docs.map(d => d.data());
      
      const pendingCandidates = allDocs
        .filter(d => d.status === "pending_review")
        .sort((a, b) => {
          const tA = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : 0;
          const tB = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : 0;
          return tB - tA;
        })
        .slice(0, 5)
        .map(d => ({
          id: d.id,
          resultadosSample: d.resultadosSample || [],
          resultCount: d.resultCount || 0,
          createdAt: d.createdAt
        }));

      return res.status(200).json({
        success: true,
        count: pendingCandidates.length,
        candidates: pendingCandidates
      });
    } catch (err: any) {
      console.error("[GET /learning/format-candidates/pending] Error:", err);
      return res.status(500).json({ error: "Erro ao buscar candidatos pendentes", details: err.message });
    }
  });

  apiRouter.post("/learning/format-candidates/:id/review", async (req, res) => {
    try {
      const { id } = req.params;
      const { approved, reviewedBy } = req.body;

      if (approved === undefined) {
        return res.status(400).json({ error: "O campo approved é obrigatório." });
      }

      const docRef = getDB().collection("format_candidates").doc(id);
      const docSnap = await docRef.get();

      if (!docSnap.exists) {
        return res.status(404).json({ error: "Candidato não encontrado." });
      }

      const updateData: any = {
        status: approved ? "approved" : "rejected",
        reviewedAt: dbServerTimestamp()
      };

      if (reviewedBy !== undefined) {
        updateData.reviewedBy = reviewedBy;
      }

      await docRef.update(updateData);

      return res.status(200).json({
        success: true,
        message: `Candidato de formato avaliado como: ${updateData.status}`
      });
    } catch (err: any) {
      console.error("[POST /learning/format-candidates/:id/review] Error:", err);
      return res.status(500).json({ error: "Erro ao atualizar revisão do candidato", details: err.message });
    }
  });

  
  // Gemini Extraction Route (Protected now)
  apiRouter.post("/gemini/extract", async (req, res) => {
    try {
      const { fileBase64, filename, mimeType, expectedType, modelStrategy } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: "O campo fileBase64 é obrigatório." });
      }

      // Fire-and-forget automatic promo check, running in background without blocking response
      promoteAutoVerifiedExamples().catch(err => console.error("[Promotion Trigger Error]", err));

      if (MOCK_MODE) {
        console.log("[MOCK_MODE] Requisição recebida do MedReconcile. Ignorando Gemini API e devolvendo 18 pacientes simulados.");
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return res.status(200).json({
          success: true,
          documentType: "etiqueta_hospitalar",
          summary: "MOCK: Extraídas 18 etiquetas hospitalares com sucesso simulado.",
          data: {
            etiquetas: Array.from({ length: 18 }).map((_, i) => ({
              nome_paciente: `PACIENTE MOCK ${i + 1}`,
              numero_atendimento: `100${i + 1}`,
              data_atendimento: "12/05/2026",
              convenio: "UNIMED SIMULADA",
              hospital: "HOSPITAL MOCK"
            }))
          }
        });
      }

      const fileBuffer = Buffer.from(fileBase64, "base64");
      
      // Supported models - Standard names for extraction
      let models = ["gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
      
      if (!modelStrategy || modelStrategy === 'rotation') {
        const offset = extractRequestCount % models.length;
        extractRequestCount++;
        models = [
          ...models.slice(offset),
          ...models.slice(0, offset)
        ];
        console.log(`[Model Rotation Extract] Revezamento ativo! Ordem de tentativa: ${models.join(", ")}`);
      } else if (modelStrategy === 'fixo-lite') {
        models = ["gemini-3.1-flash-lite"];
        console.log(`[Model Rotation Extract] Usando modelo fixo econômico: gemini-3.1-flash-lite`);
      } else {
        models = ["gemini-3.1-pro-preview"];
        console.log(`[Model Rotation Extract] Usando modelo fixo principal: gemini-3.1-pro-preview`);
      }
      
      let success = false;
      let resultData: any = null;
      let usedModel = "";
      let usedProvider: "gemini" | "groq" | "heuristica" | "local_cache" | "local_pattern" = "gemini";
      let errorMsg = "";
      let quotaExhausted = false;

      // 0. Preliminary Tesseract OCR/Text extraction so we can identify hospital & template cache
      let extractedText = "";
      try {
        if (mimeType === "application/pdf" || filename?.toLowerCase().endsWith(".pdf")) {
          console.log("[Direct Extraction Back] Extraindo texto do PDF preliminar...");
          extractedText = await parsePdfText(fileBuffer);
        } else {
          console.log("[Direct Extraction Back] Convertendo imagem e extraindo texto com Tesseract OCR preliminar...");
          const TesseractModule = await import("tesseract.js") as any;
          const Tesseract = TesseractModule.default || TesseractModule;
          const ocrPromise = Tesseract.recognize(fileBuffer, "por+eng").then((r: any) => r.data.text || "");
          // Strict timeout of 2.5s for Tesseract image OCR to avoid any hanging from dynamic CDN bundles
          extractedText = await withTimeout(ocrPromise, 2500, "");
        }
      } catch (ocrErr: any) {
        console.error("[OCR Preliminar] Falha ao processar OCR:", ocrErr.message);
      }

      const hospitalName = detectHospitalName(extractedText || filename);
      const db = getDB();

      // Check Template Cache eligibility (10+ verified examples in learned_examples)
      let verifiedCount = 0;
      try {
        const verifiedSnap = await withTimeout(
          db.collection("learned_examples")
            .where("hospital", "==", hospitalName)
            .where("verified_by_user", "==", true)
            .where("corrected_by_user", "==", false)
            .get(),
          1500, // 1.5 seconds budget
          { size: 0 } as any
        );
        verifiedCount = verifiedSnap.size || 0;
      } catch (snapErr) {
        console.warn("[Template Cache Query] Falha ao buscar contagem de verificados:", snapErr);
      }

      if (verifiedCount >= 10) {
        console.log(`[Template Cache] Hospital ${hospitalName} possui ${verifiedCount} exemplos verificados! Tentando extração via OCR local...`);
        const localParsed = extractWithLocalRegex(extractedText, hospitalName);
        if (localParsed) {
          resultData = {
            documentType: "etiqueta_hospitalar",
            summary: `[Cache Local Hit] Extração local efetuada com sucesso para o hospital ${hospitalName} (economia Gemini).`,
            nome_paciente: localParsed.nome_paciente,
            nome_paciente_confidence: 100,
            numero_atendimento: localParsed.numero_atendimento,
            numero_atendimento_confidence: 100,
            convenio: localParsed.convenio,
            convenio_confidence: 100,
            hospital: localParsed.hospital,
            hospital_confidence: 100,
            data_nascimento: localParsed.data_nascimento,
            data_nascimento_confidence: 100,
            etiquetas: [localParsed]
          };
          success = true;
          usedModel = "OCR Local (Template Cache)";
          usedProvider = "local_cache";
          console.log(`[Template Cache Hit] Extração local bem-sucedida para o hospital ${hospitalName}!`);
        } else {
          console.log(`[Template Cache Miss] Campos ausentes no OCR local de ${hospitalName}, caindo para Gemini.`);
        }
      }

      if (!success) {
        const textToCheck = ((extractedText || "") + " " + (filename || "")).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
        const isNfs = textToCheck.includes("NOTA FISCAL") || textToCheck.includes("NFS-E") || textToCheck.includes("TOMADOR DE SERVICOS") || (expectedType && expectedType.toUpperCase() === "NOTA_FISCAL");
        
        let systemPrompt = "";
        if (isNfs) {
          systemPrompt = `Você é um sistema especialista em faturamento hospitalar e notas fiscais de altíssima precisão (nível OCR Humano).
Você está processando uma Nota Fiscal de Serviço Eletrônica (NFS-e / Prefeitura / Nibo).

INSTRUÇÃO SOBRE ROTAÇÃO DE IMAGENS:
Fotos tiradas por câmeras Android podem ter metadados de rotação EXIF que afetam a orientação visual. Leia o texto em qualquer orientação (0°, 90°, 180°, 270°) e reoriente mentalmente para extrair os dados corretamente.

DIRETRIZES DE EXTRAÇÃO OBRIGATÓRIAS E REGRAS FINANCEIRAS ADITIVAS PARA NFS-e:
1. O campo "documentType" deve ser definido obrigatoriamente como "nota_fiscal".
2. O campo "emitente" deve ser obrigatoriamente preenchido com a razão social ou nome fantasia do TOMADOR DE SERVIÇOS (o hospital/cliente listado como tomador, pagador ou tomador de serviços). NÃO use o prestador de serviços.
3. O campo "cnpjEmitente" deve ser preenchido com o CNPJ do TOMADOR DE SERVIÇOS.
4. O campo "numeroNota" deve ser o número identificador da nota fiscal (ex: encontre o número único identificador, como "991" no canto superior direito).
5. O campo "dataEmissao" deve ser extraído do campo "Data e Hora da emissão", "Data de Emissão" ou similar (ex: "15/05/2026", preencha no formato DD/MM/AAAA ou AAAA-MM-DD).

HIERARQUIA FINANCEIRA PARA NOTAS FISCAIS:
- valorTotal: valor total dos serviços, geralmente em destaque no topo/meio da nota.
- valorLiquido: procure EXCLUSIVAMENTE pelos campos "Valor Líquido da Nota" ou "Líquido a Receber" impressos no documento. NÃO calcule nem subtraia impostos — se não encontrar o campo explícito, repita o valorTotal.

IDENTIFICAÇÃO DE PACIENTES, CONVÊNIOS E DATAS EM NOTAS FISCAIS:
- Nome do paciente: em notas fiscais, o paciente raramente é o "Tomador do Serviço". Procure o nome do paciente nos campos "Discriminação dos Serviços", "Observações" ou "Informações Complementares" da nota e preencha no campo "nome_paciente" (e também no array "etiquetas" se aplicável).
- Convênio: o campo "convenio" deve ser preenchido obrigatoriamente como null para notas fiscais. Convênios nunca devem ser lidos em notas fiscais — isso evita confundir o tomador de serviço com o convênio do paciente.
- Data de atendimento: procure pela data em que o procedimento foi realizado. Se não houver data de atendimento explícita no documento, use a data de emissão da nota como fallback ("data_atendimento").

6. O array "itens" deve conter a descrição de cada procedimento ou serviço de auditoria/consultoria médica faturado.
7. Se um paciente específico for identificado na nota fiscal usando as regras acima, você pode incluir o paciente no array "etiquetas" preenchendo seus dados; caso contrário, retorne o array "etiquetas" vazio [].
Retorne EXCLUSIVAMENTE o JSON estruturado atendendo a estas diretrizes de faturamento.`;
        } else {
          systemPrompt = `Você é um sistema especialista em auditoria e faturamento hospitalar de altíssima precisão (nível OCR Humano).

DETECÇÃO DE TIPO DE DOCUMENTO (OBRIGATÓRIO):
Antes de realizar qualquer extração de campos, você deve analisar visualmente a imagem e identificar o seu tipo de documento exato:
- ETIQUETA FÍSICA INDIVIDUAL (etiqueta adesiva impressa colada em prontuário)
- TELA DE SISTEMA DIGITAL (captura de tela de cadastro ou faturamento hospitalar)
- TABELA/LISTA DE AGENDA (tabela com vários agendamentos ou atendimentos em formato de linhas)
- FOLHA CIRÚRGICA / DESCRIÇÃO OPERATÓRIA (documento detalhado do procedimento cirúrgico)
- GUIA DE FATURAMENTO (guia de consulta, SADT ou internação física/digital)
Após classificar mentalmente o tipo de documento, aplique estritamente as regras de extração dedicadas abaixo.

REGRA GERAL PARA DADOS ILEGÍVEIS:
- Se um campo estiver completamente ilegível devido a reflexo de luz, rasura, dobra ou corte severo (sendo impossível qualquer leitura humana confiável), retorne o campo como vazio ("") em vez de adivinhar, inventar ou preencher dados de preenchimento fictício.
- Para letras e caracteres parcialmente visíveis (baixa resolução ou apagados), continue aplicando o esforço ativo de reconstrução descrita nas seções de etiquetas físicas.

INSTRUÇÃO SOBRE ROTAÇÃO DE IMAGENS:
Fotos tiradas por câmeras Android podem ter metadados de rotação EXIF que afetam a orientação visual. Leia o texto em qualquer orientação (0°, 90°, 180°, 270°) e reoriente mentalmente para extrair os dados corretamente.

Diretrizes de extração para ETIQUETAS, TELAS DE SISTEMA DIGITAL, AGENDAS EM TABELA E FOLHAS CIRÚRGICAS:
A imagem analisada pode ser tanto uma etiqueta física impressa quanto uma foto de tela de sistema hospitalar digital (telas de cadastro de cirurgia/internação ou telas de agenda/consultório hospitalar). Use o contexto para decifrar e extrair as informações corretas.

Campos típicos e variações de rótulos esperados:
- "Nº Atendimento", "ATEND", "REGISTRO", "Prontuario" ou "ID": Identificador numérico do atendimento.
- "Paciente", "NOME", "Nome Pac.": Nome completo do paciente (geralmente em maiúsculas).
  * Para fotos de telas de sistema: O nome do paciente frequentemente aparece após rótulos como "Nome:" ou "Paciente:". ATENÇÃO EXTREMA: Diferencie sempre o nome do paciente de nomes de médicos ou profissionais de saúde que possam constar na imagem (geralmente identificados por títulos como "Dr.", "Dra." ou acompanhados do número de CRM, ex: 'Dr. Thiago Andre...'). NUNCA extraia o nome do médico como nome do paciente.
  * Para etiquetas físicas: Mantenha o reconhecimento já existente para formatos típicos como "Leito: X / Nome" ou "Nome Pac.:".
- "Nascimento", "DATA NASC", "NASC", "DTNasc": Data de nascimento do paciente (extraia no formato AAAA-MM-DD se possível).
- "Data de Atendimento/Cirurgia/Internação": Data do procedimento ou entrada.
  * Para fotos de telas de sistema: Busque por "Data da Cirurgia:", "Data de Entrada", "Data Agendada", "Data Internação" ou "Dt. Cirurgia:" como fontes válidas adicionais para este campo.
  * Para etiquetas físicas: Mantenha a busca pelos termos existentes como "Dt.Entr:", "Atend:", "Dt. Adm:", "Admissão:", "Internação:", etc.
- "Convênio", "OPERADORA": Nome do plano de saúde ou operadora. O campo convenio é OBRIGATÓRIO.
  * Para fotos de telas de sistema: Busque por "Classe:" ou "Classe de convênio" como sinônimo para termo de convênio e operadora de saúde.
  * Para etiquetas físicas: Mantenha a busca existente por termos como 'Conv:', 'Convênio:', 'Plano:'. Exemplos de convênios: Unimed, Bradesco Saúde, SulAmérica, Amil, Particular.
  * RECONHECIMENTO DE LOGOTIPO SEM TEXTO: Se a tela ou etiqueta tiver apenas um logotipo de operadora sem texto, reconheça a marca visualmente e retorne o nome do convênio (ex: logotipo do Bradesco → "Bradesco Saúde", logotipo da Unimed → "Unimed").
- "Hospital", "CLÍNICA", "Setor": Nome do hospital, clínica ou setor, geralmente na primeira linha, cabeçalho ou campo dedicado da tela.

CAMPOS FINANCEIROS PARA TELAS DE COMPUTADOR E ETIQUETAS:
- Os campos financeiros (valorTotal, valorLiquido) devem vir obrigatoriamente como null ou zero (0). O foco destes documentos é exclusivamente convenio, nome_paciente e data_atendimento.

DIRETRIZES DE EXTRAÇÃO SEPARADAS POR TIPO DE DOCUMENTO (MUITO IMPORTANTE):
1. PARA ETIQUETAS FÍSICAS INDIVIDUAIS:
   - Garanta que a lógica de tabela de agenda só seja aplicada quando o modelo identificar explicitamente múltiplos pacientes em formato de lista/tabela. Para etiquetas físicas individuais, preserve o comportamento de OCR letra-por-letra sem tentar encaixar dados em colunas.
   - O modelo deve focar estritamente na leitura do único paciente presente na etiqueta.
   - Use comportamento de OCR clássico de altíssima fidelidade letra por letra. Para etiquetas físicas apagadas ou de baixa resolução, reconstrua os nomes e números a partir das letras visíveis, completando letra por letra.
   - NUNCA tente aplicar lógica de colunas ou encaixar os dados em uma estrutura de tabela. Isso corrompe os nomes de pacientes gerando textos embaralhados.
   - Extraia o nome do paciente com fidelidade absoluta de caracteres.

2. PARA FOTOS DE TELAS DE SISTEMAS DIGITAIS INDIVIDUAIS:
   - Filtre ruídos de botões de interface, abas secundárias e termos repetitivos.
   - Localize as seções demográficas "DADOS DO PACIENTE" ou similar para capturar o nome do paciente correto, diferenciando de nomes de médicos.

3. PARA TABELAS DE AGENDA/CONSULTÓRIO (MÚLTIPLOS PACIENTES EM FORMATO DE TABELA/LISTA):
   - USE ESTA REGRA APENAS SE IDENTIFICAR EXPLICITAMENTE UMA ESTRUTURA DE TABELA/LISTA COM MÚLTIPLOS PACIENTES NA IMAGEM.
   - Se a imagem mostrar uma tela de sistema com uma grade/tabela contendo múltiplas linhas de pacientes com horários e convênios, trate cada linha como um paciente individual no array de etiquetas. NÃO force a classificação como tabela em casos ambíguos — mantenha a classificação atual que já funciona bem.
   - Identifique a estrutura de tabela onde cada linha ou registro possui informações dispostas na seguinte ordem ou formato semelhante: Nº Atendimento | Convênio | Hora | Nome do Paciente | Status | Data/Hora | Idade | Status2
   - Exemplo real de linha: '5315008 Sul América 13:00 Rafael de Oliveira Barbosa Executada 23/06/2026 13:27:40 42a'
   - Para cada uma das linhas detectadas na tabela, extraia um item correspondente no array 'etiquetas' preenchendo:
     * nome_paciente: Nome completo do paciente (ex: 'Rafael de Oliveira Barbosa')
     * numero_atendimento: O identificador numérico de atendimento (primeiro campo numérico da linha, ex: '5315008')
     * convenio: Nome limpo do convênio/plano de saúde (ex: 'Sul América', sem truncamentos como 'SUL AMÉ...')
     * data_atendimento: A data do atendimento extraída de campos como 'Data/Hora' (ex: '23/06/2026' ou '2026-06-23')

4. PARA FOLHA CIRÚRGICA / DESCRIÇÃO OPERATÓRIA:
   - Identifique os dados do cabeçalho do documento (geralmente no topo).
   - Extraia o nome do paciente, a data do procedimento e o convênio a partir do cabeçalho.
   - NUNCA confunda o nome do cirurgião principal ou equipe médica (frequentemente listado em "Cirurgião", "Médico", "Dr.", "Dr(a).") com o nome do paciente. O nome do paciente geralmente está em um campo bem identificado como "Paciente:", "Nome:" ou "Beneficiário:".

Siga estas regras rigorosas:
1. Identidade de Telas de Sistema e Filtragem de Ruído: Fotos de telas de sistemas de faturamento/cirurgia contêm ruído visual abundante (botões de interface, campos vazios, termos repetidos das abas do sistema ou texto de outras seções). Ignore qualquer ruído ou duplicados parciais e extraia estritamente os campos demográficos solicitados que forem legíveis e inequívocos.
2. Extraia os dados demográficos com máxima atenção a detalhes sutis.
3. Identifique múltiplos registros se houver mais de uma etiqueta ou linha de tabela na foto (preencha o array 'etiquetas' com todos os registros válidos identificados).
4. Para etiquetas apagadas ou exibições ruidosas, tente reconstruir os dados de forma lógica e contextualizada.
5. Retorne EXCLUSIVAMENTE o JSON no schema solicitado.
6. Se encontrar algo que pareça um número de atendimento mas o campo estiver com confiança baixa, tente validar se os caracteres fazem sentido para um ID hospitalar.

Schema estruturado obrigatório (inclua *_confidence de 0-100):
{
  "nome_paciente": "STRING (Nome completo em MAIÚSCULAS do primeiro paciente ou principal)",
  "nome_paciente_confidence": NUMBER,
  "numero_atendimento": "STRING (Apenas os dígitos do ID de atendimento do primeiro paciente ou principal)",
  "numero_atendimento_confidence": NUMBER,
  "idade": NUMBER (Calculado a partir da data de nascimento se presente),
  "idade_confidence": NUMBER,
  "convenio": "STRING (Nome do convênio do primeiro paciente ou principal)",
  "convenio_confidence": NUMBER,
  "hospital": "STRING (Nome do hospital ou clínica)",
  "hospital_confidence": NUMBER,
  "data_nascimento": "STRING (Formato AAAA-MM-DD)",
  "data_nascimento_confidence": NUMBER,
  "documentType": "etiqueta_hospitalar" | "nota_fiscal" | "outro",
  "summary": "STRING (Resumo técnico em português descrevendo a qualidade da leitura)",
  "etiquetas": [] (Array OBRIGATÓRIO contendo TODOS OS PACIENTES detectados na imagem, e não apenas um objeto único)
}`;
        }

        // Get few-shot dynamic reference examples
        const fewShotPrompt = await getFewShotPrompt(hospitalName);
        let activePromptPart = `Por favor, analise e extraia os dados estruturados do arquivo "${filename || 'documento'}" (${expectedType || 'autodetectar'}).${fewShotPrompt}`;
        if (isNfs) {
          activePromptPart += `\nAVISO IMPORTANTE: Este documento é uma Nota Fiscal de Serviço Eletrônica (NFS-e). Identifique a seção "TOMADOR DE SERVIÇOS" e preencha "emitente" e "cnpjEmitente" com os dados do TOMADOR (o hospital/cliente pagador). Extraia também a dataEmissao, numeroNota (ex: "991"), valorTotal, valorLiquido e itens.`;
        }

        // 1. Try Gemini models sequentially
        for (const modelName of models) {
          try {
            console.log(`[Direct Extraction] Tentando modelo Gemini: ${modelName}...`);
            
            const filePart = {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: fileBase64
              }
            };

            const responseSchema = {
              type: Type.OBJECT,
              properties: {
                documentType: { type: Type.STRING },
                summary: { type: Type.STRING },
                nome_paciente: { type: Type.STRING },
                nome_paciente_confidence: { type: Type.NUMBER },
                numero_atendimento: { type: Type.STRING },
                numero_atendimento_confidence: { type: Type.NUMBER },
                idade: { type: Type.NUMBER },
                idade_confidence: { type: Type.NUMBER },
                convenio: { type: Type.STRING },
                convenio_confidence: { type: Type.NUMBER },
                hospital: { 
                  type: Type.STRING,
                  description: "Nome do hospital ou clínica, geralmente na primeira linha ou cabeçalho da etiqueta hospitalar."
                },
                hospital_confidence: { type: Type.NUMBER },
                data_nascimento: { type: Type.STRING },
                data_nascimento_confidence: { type: Type.NUMBER },
                data_atendimento: {
                  type: Type.STRING,
                  description: "Data de entrada/atendimento/internação/cirurgia do paciente, geralmente identificada na etiqueta por rótulos como 'Dt.Entr:', 'Dt. Entr:', 'Data Entrada:', 'Atend:', 'Dt. Adm:', 'Admissão:' ou 'Internação:'. Formato esperado: string como aparece na etiqueta (ex: '05/06/2026'). NUNCA confunda com a data de nascimento (geralmente rotulada como 'Dt.Nasc:' ou 'Nasc:')."
                },
                data_atendimento_confidence: { type: Type.NUMBER },
                etiquetas: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      nome_paciente: { type: Type.STRING },
                      nome_paciente_confidence: { type: Type.NUMBER },
                      numero_atendimento: { type: Type.STRING },
                      numero_atendimento_confidence: { type: Type.NUMBER },
                      idade: { type: Type.NUMBER },
                      idade_confidence: { type: Type.NUMBER },
                      convenio: { type: Type.STRING },
                      convenio_confidence: { type: Type.NUMBER },
                      hospital: { 
                        type: Type.STRING,
                        description: "Nome do hospital ou clínica, geralmente na primeira linha ou cabeçalho da etiqueta hospitalar."
                      },
                      hospital_confidence: { type: Type.NUMBER },
                      data_nascimento: { type: Type.STRING },
                      data_nascimento_confidence: { type: Type.NUMBER },
                      data_atendimento: {
                        type: Type.STRING,
                        description: "Data de entrada/atendimento/internação/cirurgia do paciente, geralmente identificada na etiqueta por rótulos como 'Dt.Entr:', 'Dt. Entr:', 'Data Entrada:', 'Atend:', 'Dt. Adm:', 'Admissão:' ou 'Internação:'. Formato esperado: string como aparece na etiqueta (ex: '05/06/2026'). NUNCA confunda com a data de nascimento (geralmente rotulada como 'Dt.Nasc:' ou 'Nasc:')."
                      },
                      data_atendimento_confidence: { type: Type.NUMBER }
                    }
                  }
                },
                numeroNota: { 
                  type: Type.STRING, 
                  description: "O número identificador único da Nota Fiscal (ex: encontre o número destacado como '991', 'Número da Nota', 'Nota n°'). Deixe em branco se for etiqueta." 
                },
                numeroNota_confidence: { type: Type.NUMBER },
                dataEmissao: { 
                  type: Type.STRING, 
                  description: "A data de emissão exata da Nota Fiscal no formato DD/MM/AAAA ou AAAA-MM-DD. Deve ser extraída de campos como 'Data e Hora da emissão' ou similar (ex: se no texto diz 'Data e Hora da emissão: 15/05/2026 12:24:08', extraia exatamente '15/05/2026'). Deixe em branco se for etiqueta." 
                },
                dataEmissao_confidence: { type: Type.NUMBER },
                emitente: { 
                  type: Type.STRING, 
                  description: "ATENÇÃO OBRIGATÓRIA: Para Notas Fiscais (NFS-e/Prefeitura/Nibo), preencha este campo OBRIGATORIAMENTE com a razão social ou nome do TOMADOR DE SERVIÇOS (o hospital ou contratante listado na nota como tomador/cliente, ex: 'ASSOCIACAO HOSPITALAR FILHAS DE NOSSA SENHORA DO MONTE CALVARIO'). NUNCA preencha com o emitente/prestador original de serviços médicos. Deixe em branco se for etiqueta." 
                },
                emitente_confidence: { type: Type.NUMBER },
                cnpjEmitente: { 
                  type: Type.STRING, 
                  description: "ATENÇÃO OBRIGATÓRIA: Para Notas Fiscais, preencha este campo OBRIGATORIAMENTE com o CNPJ do TOMADOR DE SERVIÇOS (o hospital ou contratante listado como tomador/cliente). NUNCA preencha com o CNPJ do prestador. Deixe em branco se for etiqueta." 
                },
                cnpjEmitente_confidence: { type: Type.NUMBER },
                valorTotal: { 
                  type: Type.STRING, 
                  description: "O valor total bruto ou dos serviços faturados na Nota Fiscal (ex: 'R$ 1.500,00' ou '1500,00'). Deixe em branco ou zerado se for etiqueta." 
                },
                valorTotal_confidence: { type: Type.NUMBER },
                valorLiquido: {
                  type: Type.NUMBER,
                  description: "Valor líquido da nota fiscal. Procure EXCLUSIVAMENTE pelos campos 'Valor Líquido da Nota' ou 'Líquido a Receber' impressos no documento. NÃO calcule nem subtraia impostos — se não encontrar o campo explícito de forma literal, repita o valorTotal."
                },
                valorLiquido_confidence: { type: Type.NUMBER },
                itens: {
                  type: Type.ARRAY,
                  description: "Array dos itens ou serviços de auditoria/consultoria médica faturados na nota.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      descricao: { type: Type.STRING },
                      quantidade: { type: Type.NUMBER },
                      valorUnitario: { type: Type.NUMBER },
                      valorTotal: { type: Type.NUMBER }
                    }
                  }
                }
              },
              required: ["documentType", "summary", "etiquetas"]
            };

            const result = await generateGeminiContentWithRetry(
              modelName,
              [filePart, activePromptPart],
              systemPrompt,
              "application/json",
              responseSchema
            );

            if (result.text) {
              resultData = JSON.parse(result.text.trim());
              success = true;
              usedModel = `${modelName} (${result.usedKey})`;
              usedProvider = "gemini";
              quotaExhausted = !!result.quotaExhausted;
              console.log(`[Direct Extraction] Sucesso com o modelo Gemini: ${modelName} usando a chave ${result.usedKey}`);
              break;
            }
          } catch (err: any) {
            console.warn(`[Direct Extraction] Falha com o modelo Gemini ${modelName}:`, err.message);
            errorMsg = err.message || "Erro desconhecido no Gemini";
          }
        }

        // 2. OCR + Groq Fallback if Gemini failed (e.g. 429)
        if (!success) {
          console.log("[Direct Extraction] Todos os modelos Gemini falharam. Fallback para Groq com OCR preliminar... ");
          const groqApiKey = process.env.GROQ_API_KEY;
          if (!groqApiKey) {
            throw new Error(`Gemini falhou (${errorMsg}) e GROQ_API_KEY não está configurada para fallback.`);
          }

          if (!extractedText || extractedText.trim().length === 0) {
            extractedText = "[OCR não retornou texto detectável preliminarmente]";
          }

          console.log(`[Direct Extraction Back] Enviando texto extraído para Groq llama-3.3-70b-versatile. Tamanho do texto: ${extractedText.length}`);

          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: `${systemPrompt}\n\nVocê deve analisar o texto bruto extraído via OCR abaixo e retornar OBRIGATORIAMENTE um objeto JSON puro atendendo precisamente aos schemas definidos de etiquetas ou notas fiscais.`
                },
                {
                  role: "user",
                  content: `Aqui está o texto bruto extraído:\n\n${extractedText}`
                }
              ],
              temperature: 0.1
            })
          });

          if (!groqResponse.ok) {
            const groqErrText = await groqResponse.text();
            throw new Error(`Falha na API da Groq: ${groqResponse.status} - ${groqErrText}`);
          }

          const groqData = await groqResponse.json();
          const groqResultText = groqData.choices[0].message.content;
          
          if (groqResultText) {
            resultData = JSON.parse(groqResultText.trim());
            success = true;
            usedModel = "llama-3.3-70b-versatile";
            usedProvider = "groq";
            console.log("[Direct Extraction Back] Sucesso com o fallback Groq llama-3.3-70b-versatile!");
          }
        }
      }

      if (!success) {
        console.log(`[Direct Extraction Contingency] Ativando heurística local de contingência para "${filename}"`);
        resultData = getHeuristicFallback(filename, expectedType);
        success = true;
        usedModel = "Heurístico (Cota Contingência)";
        usedProvider = "heuristica";
      }

      // Unify Schema and Filter Name Contamination
      resultData = normalizeExtractionData(resultData);
      console.log("Pacientes recebidos da IA:", resultData?.etiquetas?.length || 0);

      // Register Learning Log for Stats Panel (Background operation - no await for rapid response)
      try {
        db.collection("learning_logs").add({
          timestamp: new Date(),
          hospital: hospitalName,
          provider: usedProvider,
          model: usedModel
        }).catch(err => console.error("Erro ao salvar log de aprendizado em segundo plano:", err));
      } catch (logErr) {
        console.error("Erro ao registrar log de aprendizado:", logErr);
      }

      // Save to learned_examples if extracted from Gemini/Groq (Background operation - no await)
      if (usedProvider === "gemini" || usedProvider === "groq") {
        saveLearnedExample(fileBase64, resultData, extractedText)
          .catch(err => console.error("Erro ao salvar exemplo aprendido em segundo plano:", err));
      }

      const image_hash = getImageHash(fileBase64);

      return res.status(200).json({
        success: true,
        documentType: resultData.documentType || "outro",
        summary: resultData.summary || "Relatório gerado automaticamente por IA.",
        image_hash: image_hash,
        data: resultData,
        usedModel: usedModel,
        usedProvider: usedProvider,
        quotaExhausted: quotaExhausted
      });

    } catch (err: any) {
      console.error("[Direct Extraction Back Error] Erro geral no extrator:", err);
      const isQuota = err.status === 429 || String(err.message).includes("Cota de processamento");
      return res.status(isQuota ? 429 : 500).json({
        success: false,
        error: err.message || "Erro crítico durante a extração de dados.",
        usedModel: "N/A",
        usedProvider: "gemini",
        quotaExhausted: isQuota
      });
    }
  });

  // Public Extraction endpoint (No Auth)
  app.post("/public/extract", async (req, res) => {
    try {
      const { fileBase64, filename, mimeType, expectedType, modelStrategy, prompt, schema } = req.body;
      if (!fileBase64) {
        return res.status(400).json({ error: "O campo fileBase64 é obrigatório." });
      }

      // Fire-and-forget automatic promo check, running in background without blocking response
      promoteAutoVerifiedExamples().catch(err => console.error("[Promotion Trigger Error]", err));

      if (MOCK_MODE) {
        console.log("[MOCK_MODE] Requisição recebida do MedReconcile. Ignorando Gemini API e devolvendo 18 pacientes simulados.");
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        return res.status(200).json({
          success: true,
          documentType: "etiqueta_hospitalar",
          summary: "MOCK: Extraídas 18 etiquetas hospitalares com sucesso simulado.",
          data: {
            etiquetas: Array.from({ length: 18 }).map((_, i) => ({
              nome_paciente: `PACIENTE MOCK ${i + 1}`,
              numero_atendimento: `100${i + 1}`,
              data_atendimento: "12/05/2026",
              convenio: "UNIMED SIMULADA",
              hospital: "HOSPITAL MOCK"
            }))
          }
        });
      }

      const fileBuffer = Buffer.from(fileBase64, "base64");
      
      // Supported models - Standard names for public extraction
      let models = ["gemini-flash-latest", "gemini-3.1-flash-lite", "gemini-3.5-flash"];
      
      if (!modelStrategy || modelStrategy === 'rotation') {
        const offset = extractRequestCount % models.length;
        extractRequestCount++;
        models = [
          ...models.slice(offset),
          ...models.slice(0, offset)
        ];
        console.log(`[Model Rotation Extract] Revezamento ativo! Ordem de tentativa: ${models.join(", ")}`);
      } else if (modelStrategy === 'fixo-lite') {
        models = ["gemini-3.1-flash-lite"];
        console.log(`[Model Rotation Extract] Usando modelo fixo econômico: gemini-3.1-flash-lite`);
      } else {
        models = ["gemini-3.1-pro-preview"];
        console.log(`[Model Rotation Extract] Usando modelo fixo principal: gemini-3.1-pro-preview`);
      }
      
      let success = false;
      let resultData: any = null;
      let usedModel = "";
      let usedProvider: "gemini" | "groq" | "heuristica" | "local_cache" | "local_pattern" = "gemini";
      let errorMsg = "";
      let quotaExhausted = false;

      let pdfText = "";
      if (prompt) {
        console.log("[Direct Extraction] Recebida requisição com prompt customizado. Tentando padrão local antes do Gemini.");
        
        try {
          const tStart = performance.now();
          console.log(`[TIMING] [${new Date().toISOString()}] Starting parsePdfText inside prompt-based extraction in /public/extract...`);
          pdfText = await parsePdfText(fileBuffer);
          const tEnd = performance.now();
          console.log(`[TIMING] [${new Date().toISOString()}] Finished parsePdfText in /public/extract. Time taken: ${(tEnd - tStart).toFixed(2)}ms`);
          
          // Tenta padrão local ORTTRAM se especificado no prompt
          const isOrttramPrompt = prompt.toLowerCase().includes("medico cadastrado") || prompt.toLowerCase().includes("médico cadastrado");
          if (isOrttramPrompt) {
            const orttramResult = extractOrttramTable(pdfText, prompt);
            if (orttramResult && orttramResult.resultados && orttramResult.resultados.length > 0) {
              console.log(`[Direct Extraction] Formato ORTTRAM identificado localmente (${orttramResult.resultados.length} atendimentos únicos). Pulando Gemini.`);
              return res.status(200).json({
                success: true,
                usedModel: "N/A",
                usedProvider: "local_pattern",
                data: {
                  resultados: orttramResult.resultados
                }
              });
            }
          }

          const localTable = extractSoulmvTable(pdfText);
          
          if (localTable && localTable.rows && localTable.rows.length > 0) {
            console.log(`[Direct Extraction] Formato SOULMV identificado localmente (${localTable.rows.length} registros). Pulando Gemini.`);
            
            // Filter by activity based on prompt intent
            const promptUpper = (prompt || "").toUpperCase();
            const hasClinicalTerm = promptUpper.includes("CLINICO");
            const hasSurgicalTerm = promptUpper.includes("CIRURGICO") || promptUpper.includes("CIRURGIAO") || promptUpper.includes("AUXILIAR") || promptUpper.includes("DIFERENTE");

            let filteredRows = localTable.rows;
            // Se tem termos cirúrgicos ou diz "DIFERENTE", assume modo Cirúrgico (Não-Clínico)
            if (hasSurgicalTerm) {
              console.log("[Direct Extraction] Modo detectado: CIRÚRGICO (Não-Clínico)");
              filteredRows = localTable.rows.filter(r => (r.Atividade || "").toUpperCase() !== "CLINICO");
            } 
            // Se não tem termos cirúrgicos mas tem "CLINICO", assume modo Clínico
            else if (hasClinicalTerm) {
              console.log("[Direct Extraction] Modo detectado: CLÍNICO");
              filteredRows = localTable.rows.filter(r => (r.Atividade || "").toUpperCase() === "CLINICO");
            }

            // Map to unified schema: { resultados: [{ nome_paciente, numero_atendimento, valor, data_atendimento, atividade }] }
            const mappedResultados = filteredRows.map(row => {
              // Convert "500,00" string to 500.00 number
              const valorStr = (row["Vl.Repasse"] || "0").replace(/\./g, "").replace(",", ".");
              const valorNum = parseFloat(valorStr) || 0;

              return {
                nome_paciente: row["Paciente"] || "",
                numero_atendimento: row["Atendimento"] || "",
                valor: valorNum,
                data_atendimento: row["Data"] || "",
                atividade: row["Atividade"] || ""
              };
            });

            let resultadosFinais = mappedResultados;
            if (hasSurgicalTerm) {
              const groupedMap = new Map();
              for (const row of mappedResultados) {
                const key = row.numero_atendimento;
                const activityKey = (row.atividade || "").toUpperCase();
                
                if (groupedMap.has(key)) {
                  const existing = groupedMap.get(key);
                  existing.valor += row.valor;
                  if (activityKey) {
                    existing.breakdown[activityKey] = (existing.breakdown[activityKey] || 0) + row.valor;
                  }
                } else {
                  const breakdown = {};
                  if (activityKey) {
                    breakdown[activityKey] = row.valor;
                  }
                  groupedMap.set(key, { ...row, breakdown });
                }
              }
              resultadosFinais = Array.from(groupedMap.values()).map(r => {
                const cleanBreakdown = {};
                if (r.breakdown) {
                  for (const [k, v] of Object.entries(r.breakdown)) {
                    cleanBreakdown[k] = Math.round((v as number) * 100) / 100;
                  }
                }
                const { atividade, ...rest } = r;
                return {
                  ...rest,
                  valor: Math.round(r.valor * 100) / 100,
                  breakdown: cleanBreakdown
                };
              });
            }

            return res.status(200).json({
              success: true,
              usedModel: "N/A",
              usedProvider: "local_pattern",
              data: {
                resultados: resultadosFinais
              }
            });
          }
        } catch (localErr) {
          console.warn("[Direct Extraction] Erro na tentativa de extração local:", localErr);
        }

        console.log("[Direct Extraction] Padrão local não encontrado ou inválido. Seguindo para o Gemini.");
        const filePart = {
          inlineData: {
            mimeType: mimeType || "image/jpeg",
            data: fileBase64
          }
        };

        for (const modelName of models) {
          try {
            console.log(`[Direct Extraction] Tentando modelo Gemini (Custom Prompt): ${modelName}...`);
            const sysInstr = "Você é um sistema especialista em extração de dados médicos e faturamento.";
            const responseMimeType = schema ? "application/json" : undefined;
            const responseSchema = schema ? schema : undefined;

            const response = await generateGeminiContentWithRetry(
              modelName,
              [prompt, filePart],
              sysInstr,
              responseMimeType,
              responseSchema
            );

            const text = response.text;
            
            if (schema) {
               const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
               const jsonText = match ? match[1] : text;
               resultData = JSON.parse(jsonText);
            } else {
               try {
                 const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                 const jsonText = match ? match[1] : text;
                 resultData = JSON.parse(jsonText);
               } catch {
                 resultData = { raw_text: text };
               }
            }

            success = true;
            usedModel = modelName;
            break;
          } catch (e: any) {
            console.error(`[Direct Extraction Custom Prompt] Falha no modelo ${modelName}:`, e.message);
            if (e.message.includes("429") || e.message.includes("quota")) quotaExhausted = true;
            errorMsg = e.message;
          }
        }

        if (success) {
          // Capturar candidatos a novos formatos de relatório automaticamente
          let resultCount = 0;
          let hasBreakdown = false;
          let resultadosSample: any[] = [];
          
          if (resultData) {
            let resultsArray: any[] | null = null;
            if (Array.isArray(resultData)) {
              resultsArray = resultData;
            } else if (resultData.resultados && Array.isArray(resultData.resultados)) {
              resultsArray = resultData.resultados;
            } else if (resultData.items && Array.isArray(resultData.items)) {
              resultsArray = resultData.items;
            } else if (resultData.pacientes && Array.isArray(resultData.pacientes)) {
              resultsArray = resultData.pacientes;
            }
            
            if (resultsArray) {
              resultCount = resultsArray.length;
              hasBreakdown = resultsArray.some(r => r && r.breakdown && (typeof r.breakdown === 'object' && Object.keys(r.breakdown).length > 0));
              
              resultadosSample = resultsArray.slice(0, 5).map(item => {
                if (!item) return null;
                return {
                  nome_paciente: item.nome_paciente || item.nome || item.paciente || "",
                  numero_atendimento: item.numero_atendimento || item.atendimento || item.registro || "",
                  valor: item.valor !== undefined ? item.valor : (item.valorTotal !== undefined ? item.valorTotal : (item.pago !== undefined ? item.pago : null))
                };
              }).filter(Boolean);
            }
          }

          if (resultCount >= 1) {
            try {
              const candidateId = crypto.randomUUID();
              const promptLines = (prompt || "").split(/\r?\n/);
              const promptUsedSnippet = promptLines.slice(0, 2).join("\n");
              const pdfTextSample = (pdfText || "").substring(0, 1500);

              await getDB().collection("format_candidates").doc(candidateId).set({
                id: candidateId,
                pdfTextSample,
                resultCount,
                hasBreakdown,
                resultadosSample,
                status: "pending_review",
                promptUsedSnippet,
                usedModel,
                createdAt: dbServerTimestamp()
              });
              console.log(`[Format Candidate] Candidato salvo com sucesso em format_candidates! ID: ${candidateId}`);
            } catch (dbErr) {
              console.error("[Format Candidate] Erro ao salvar candidato em format_candidates:", dbErr);
            }
          }

          return res.status(200).json({
            success: true,
            usedModel,
            usedProvider,
            data: resultData
          });
        } else {
          return res.status(500).json({ 
            error: "Falha na extração com prompt customizado após esgotar modelos",
            details: errorMsg
          });
        }
      }

      // 0. Preliminary Tesseract OCR/Text extraction so we can identify hospital & template cache
      let extractedText = "";
      try {
        if (mimeType === "application/pdf" || filename?.toLowerCase().endsWith(".pdf")) {
          console.log("[Direct Extraction Back] Extraindo texto do PDF preliminar...");
          const tStart = performance.now();
          console.log(`[TIMING] [${new Date().toISOString()}] Starting parsePdfText (preliminary OCR block) inside /public/extract...`);
          extractedText = await parsePdfText(fileBuffer);
          const tEnd = performance.now();
          console.log(`[TIMING] [${new Date().toISOString()}] Finished parsePdfText (preliminary OCR block) in /public/extract. Time taken: ${(tEnd - tStart).toFixed(2)}ms`);
        } else {
          console.log("[Direct Extraction Back] Convertendo imagem e extraindo texto com Tesseract OCR preliminar...");
          const TesseractModule = await import("tesseract.js") as any;
          const Tesseract = TesseractModule.default || TesseractModule;
          const ocrPromise = Tesseract.recognize(fileBuffer, "por+eng").then((r: any) => r.data.text || "");
          // Strict timeout of 2.5s for Tesseract image OCR to avoid any hanging from dynamic CDN bundles
          extractedText = await withTimeout(ocrPromise, 2500, "");
        }
      } catch (ocrErr: any) {
        console.error("[OCR Preliminar] Falha ao processar OCR:", ocrErr.message);
      }

      const hospitalName = detectHospitalName(extractedText || filename);
      const db = getDB();

      // Check Template Cache eligibility (10+ verified examples in learned_examples)
      let verifiedCount = 0;
      try {
        const verifiedSnap = await withTimeout(
          db.collection("learned_examples")
            .where("hospital", "==", hospitalName)
            .where("verified_by_user", "==", true)
            .where("corrected_by_user", "==", false)
            .get(),
          1500, // 1.5 seconds budget
          { size: 0 } as any
        );
        verifiedCount = verifiedSnap.size || 0;
      } catch (snapErr) {
        console.warn("[Template Cache Query] Falha ao buscar contagem de verificados:", snapErr);
      }

      if (verifiedCount >= 10) {
        console.log(`[Template Cache] Hospital ${hospitalName} possui ${verifiedCount} exemplos verificados! Tentando extração via OCR local...`);
        const localParsed = extractWithLocalRegex(extractedText, hospitalName);
        if (localParsed) {
          resultData = {
            documentType: "etiqueta_hospitalar",
            summary: `[Cache Local Hit] Extração local efetuada com sucesso para o hospital ${hospitalName} (economia Gemini).`,
            nome_paciente: localParsed.nome_paciente,
            nome_paciente_confidence: 100,
            numero_atendimento: localParsed.numero_atendimento,
            numero_atendimento_confidence: 100,
            convenio: localParsed.convenio,
            convenio_confidence: 100,
            hospital: localParsed.hospital,
            hospital_confidence: 100,
            data_nascimento: localParsed.data_nascimento,
            data_nascimento_confidence: 100,
            etiquetas: [localParsed]
          };
          success = true;
          usedModel = "OCR Local (Template Cache)";
          usedProvider = "local_cache";
          console.log(`[Template Cache Hit] Extração local bem-sucedida para o hospital ${hospitalName}!`);
        } else {
          console.log(`[Template Cache Miss] Campos ausentes no OCR local de ${hospitalName}, caindo para Gemini.`);
        }
      }

      if (!success) {
        const filenameUpper = (filename || "").toUpperCase();
        const isNfsByFilename = filenameUpper.includes("NOTA") || filenameUpper.includes("NF") || filenameUpper.includes("FATURA") || filenameUpper.includes("RECIBO") || (expectedType && expectedType.toUpperCase() === "NOTA_FISCAL");

        let systemPrompt = "";
        if (isNfsByFilename) {
          systemPrompt = `Você é um sistema especialista em faturamento hospitalar e notas fiscais de altíssima precisão (nível OCR Humano).
Você está processando uma Nota Fiscal de Serviço Eletrônica (NFS-e / Prefeitura / Nibo).

INSTRUÇÃO SOBRE ROTAÇÃO DE IMAGENS:
Fotos tiradas por câmeras Android podem ter metadados de rotação EXIF que afetam a orientação visual. Leia o texto em qualquer orientação (0°, 90°, 180°, 270°) e reoriente mentalmente para extrair os dados corretamente.

DIRETRIZES DE EXTRAÇÃO OBRIGATÓRIAS E REGRAS FINANCEIRAS ADITIVAS PARA NFS-e:
1. O campo "documentType" deve ser definido obrigatoriamente como "nota_fiscal".
2. O campo "emitente" deve ser obrigatoriamente preenchido com a razão social ou nome fantasia do TOMADOR DE SERVIÇOS (o hospital/cliente listado como tomador, pagador ou tomador de serviços). NÃO use o prestador de serviços.
3. O campo "cnpjEmitente" deve ser preenchido com o CNPJ do TOMADOR DE SERVIÇOS.
4. O campo "numeroNota" deve ser o número identificador da nota fiscal (ex: encontre o número único identificador, como "991" no canto superior direito).
5. O campo "dataEmissao" deve ser extraído do campo "Data e Hora da emissão", "Data de Emissão" ou similar (ex: "15/05/2026", preencha no formato DD/MM/AAAA ou AAAA-MM-DD).

HIERARQUIA FINANCEIRA PARA NOTAS FISCAIS:
- valorTotal: valor total dos serviços, geralmente em destaque no topo/meio da nota.
- valorLiquido: procure EXCLUSIVAMENTE pelos campos "Valor Líquido da Nota" ou "Líquido a Receber" impressos no documento. NÃO calcule nem subtraia impostos — se não encontrar o campo explícito, repita o valorTotal.

IDENTIFICAÇÃO DE PACIENTES, CONVÊNIOS E DATAS EM NOTAS FISCAIS:
- Nome do paciente: em notas fiscais, o paciente raramente é o "Tomador do Serviço". Procure o nome do paciente nos campos "Discriminação dos Serviços", "Observações" ou "Informações Complementares" da nota e preencha no campo "nome_paciente" (e também no array "etiquetas" se aplicável).
- Convênio: o campo "convenio" deve ser preenchido obrigatoriamente como null para notas fiscais. Convênios nunca devem ser lidos em notas fiscais — isso evita confundir o tomador de serviço com o convênio do paciente.
- Data de atendimento: procure pela data em que o procedimento foi realizado. Se não houver data de atendimento explícita no documento, use a data de emissão da nota como fallback ("data_atendimento").

6. O array "itens" deve conter a descrição de cada procedimento ou serviço de auditoria/consultoria médica faturado.
7. Se um paciente específico for identificado na nota fiscal usando as regras acima, você pode incluir o paciente no array "etiquetas" preenchendo seus dados; caso contrário, retorne o array "etiquetas" vazio [].
Retorne EXCLUSIVAMENTE o JSON estruturado atendendo a estas diretrizes de faturamento.`;
        } else {
          systemPrompt = `Você é um sistema especialista em faturamento hospitalar, etiquetas hospitalares e telas de sistema/agendas.
Se a imagem for identificada como uma etiqueta hospitalar ou foto de tela de sistema/agenda, use o schema de etiqueta usual.
Se, no entanto, a imagem contiver elementos de "NOTA FISCAL", "NFS-e" ou "TOMADOR DE SERVIÇOS" (seja de prefeitura, Nibo ou etc.), extraia como uma NOTA FISCAL (documentType: "nota_fiscal") e siga estritamente estas regras:
- O campo "emitente" deve ser obrigatoriamente preenchido com os dados do TOMADOR DE SERVIÇOS (o hospital/empresa contratante), NUNCA os dados do emitente/prestador original de serviços médicos.
- O campo "cnpjEmitente" deve ser o CNPJ do TOMADOR DE SERVIÇOS.
- O campo "dataEmissao" deve ser a data de emissão.
- O campo "numeroNota" deve ser o número identificador (ex: "991" ou similar).

HIERARQUIA FINANCEIRA PARA NOTAS FISCAIS:
  * valorTotal: valor total dos serviços, geralmente em destaque no topo/meio da nota.
  * valorLiquido: procure EXCLUSIVAMENTE pelos campos "Valor Líquido da Nota" ou "Líquido a Receber" impressos no documento. NÃO calcule nem subtraia impostos — se não encontrar o campo explícito, repita o valorTotal.

IDENTIFICAÇÃO DE PACIENTES, CONVÊNIOS E DATAS EM NOTAS FISCAIS:
  * Nome do paciente: em notas fiscais, o paciente raramente é o "Tomador do Serviço". Procure o nome do paciente nos campos "Discriminação dos Serviços", "Observações" ou "Informações Complementares" da nota e preencha no campo "nome_paciente" (e também no array "etiquetas" se aplicável).
  * Convênio: o campo "convenio" deve ser preenchido obrigatoriamente como null para notas fiscais. Convênios nunca devem ser lidos em notas fiscais — isso evita confundir o tomador de serviço com o convênio do paciente.
  * Data de atendimento: procure pela data em que o procedimento foi realizado. Se não houver data de atendimento explícita no documento, use a data de emissão da nota como fallback ("data_atendimento").

- O array "itens" deve conter os procedimentos.
- Se um paciente for identificado na nota fiscal, você pode incluir o paciente no array "etiquetas" preenchendo seus dados; caso contrário, retorne o array "etiquetas" vazio [].

DETECÇÃO DE TIPO DE DOCUMENTO (OBRIGATÓRIO):
Antes de realizar qualquer extração de campos, você deve analisar visualmente a imagem e identificar o seu tipo de documento exato:
- ETIQUETA FÍSICA INDIVIDUAL (etiqueta adesiva impressa colada em prontuário)
- TELA DE SISTEMA DIGITAL (captura de tela de cadastro ou faturamento hospitalar)
- TABELA/LISTA DE AGENDA (tabela com vários agendamentos ou atendimentos em formato de linhas)
- FOLHA CIRÚRGICA / DESCRIÇÃO OPERATÓRIA (documento detalhado do procedimento cirúrgico)
- GUIA DE FATURAMENTO (guia de consulta, SADT ou internação física/digital)
Após classificar mentalmente o tipo de documento, aplique estritamente as regras de extração dedicadas abaixo.

REGRA GERAL PARA DADOS ILEGÍVEIS:
- Se um campo estiver completamente ilegível devido a reflexo de luz, rasura, dobra ou corte severo (sendo impossível qualquer leitura humana confiável), retorne o campo como vazio ("") em vez de adivinhar, inventar ou preencher dados de preenchimento fictício.
- Para letras e caracteres parcialmente visíveis (baixa resolução ou apagados), continue aplicando o effort de reconstrução descrita nas seções de etiquetas físicas.

INSTRUÇÃO SOBRE ROTAÇÃO DE IMAGENS:
Fotos tiradas por câmeras Android podem ter metadados de rotação EXIF que afetam a orientação visual. Leia o texto em qualquer orientação (0°, 90°, 180°, 270°) e reoriente mentalmente para extrair os dados corretamente.

Para ETIQUETAS HOSPITALARES normais, TELAS DE SISTEMA DIGITAL, AGENDAS EM TABELA E FOLHAS CIRÚRGICAS:
A imagem analisada pode ser tanto uma etiqueta física impressa quanto uma foto de tela de sistema hospitalar digital (telas de cadastro de cirurgia/internação ou telas de agenda/consultório).
Identifique os dados demográficos (nome_paciente, numero_atendimento, idade, convenio, hospital, data_nascimento) e preencha o array de etiquetas seguindo estas regras aditivas:
1. Identificação do Paciente: O nome do paciente geralmente está ao lado ou abaixo de rótulos como "Nome:" ou "Paciente:". Diferencie sempre do nome de qualquer médico ou profissional de saúde listado na imagem (frequentemente precedidos por "Dr.", "Dra." ou acompanhados do CRM). Conserve também reconhecimento de formatos como "Leito: X / Nome" para etiquetas físicas.

CAMPOS FINANCEIROS PARA TELAS DE COMPUTADOR E ETIQUETAS:
- Os campos financeiros (valorTotal, valorLiquido) devem vir obrigatoriamente como null ou zero (0). O foco destes documentos é exclusivamente convenio, nome_paciente e data_atendimento.

DIRETRIZES DE EXTRAÇÃO SEPARADAS POR TIPO DE DOCUMENTO (MUITO IMPORTANTE):
- PARA ETIQUETAS FÍSICAS INDIVIDUAIS:
  * Garanta que a lógica de tabela de agenda só seja aplicada quando o modelo identificar explicitamente múltiplos pacientes em formato de lista/tabela. Para etiquetas físicas individuais, preserve o comportamento de OCR letra-por-letra sem tentar encaixar dados em colunas.
  * O modelo deve focar estritamente na leitura do único paciente presente na etiqueta.
  * Use comportamento de OCR clássico de altíssima fidelidade letra por letra. Para etiquetas físicas apagadas ou de baixa resolução, reconstrua os nomes e números a partir das letras visíveis, completando letra por letra.
  * NUNCA tente aplicar lógica de colunas ou encaixar os dados em uma estrutura de tabela. Isso corrompe os nomes de pacientes gerando textos embaralhados.
  * Extraia o nome do paciente com fidelidade absoluta de caracteres.

- PARA FOTOS DE TELAS DE SISTEMAS DIGITAIS INDIVIDUAIS:
  * Filtre ruídos de botões de interface, abas secundárias e termos repetitivos.
  * Localize as seções demográficas "DADOS DO PACIENTE" ou similar para capturar o nome do paciente correto, diferenciando de nomes de médicos.

- PARA TABELAS DE AGENDA/CONSULTÓRIO (MÚLTIPLOS PACIENTES EM FORMATO DE TABELA/LISTA):
  * USE ESTA REGRA APENAS SE IDENTIFICAR EXPLICITAMENTE UMA ESTRUTURA DE TABELA/LISTA COM MÚLTIPLOS PACIENTES NA IMAGEM.
  * Se a imagem mostrar uma tela de sistema com uma grade/tabela contendo múltiplas linhas de pacientes com horários e convênios, trate cada linha como um paciente individual no array de etiquetas. NÃO force a classificação como tabela em casos ambíguos — mantenha a classificação atual que já funciona bem.
  * Identifique a estrutura de tabela onde cada linha ou registro possui informações dispostas na seguinte ordem ou formato semelhante: Nº Atendimento | Convênio | Hora | Nome do Paciente | Status | Data/Hora | Idade | Status2
  * Exemplo real de linha: '5315008 Sul América 13:00 Rafael de Oliveira Barbosa Executada 23/06/2026 13:27:40 42a'
  * Para cada uma das linhas detectadas na tabela, extraia um item correspondente no array 'etiquetas' preenchendo:
    * nome_paciente: Nome completo do paciente (ex: 'Rafael de Oliveira Barbosa')
    * numero_atendimento: O identificador numérico de atendimento (primeiro campo numérico da linha, ex: '5315008')
    * convenio: Nome limpo do convênio/plano de saúde (ex: 'Sul América', sem truncamentos como 'SUL AMÉ...')
    * data_atendimento: A data do atendimento extraída de campos como 'Data/Hora' (ex: '23/06/2026' ou '2026-06-23')

- PARA FOLHA CIRÚRGICA / DESCRIÇÃO OPERATÓRIA:
  * Identifique os dados do cabeçalho do documento (geralmente no topo).
  * Extraia o nome do paciente, a data do procedimento e o convênio a partir do cabeçalho.
  * NUNCA confunda o nome do cirurgião principal ou equipe médica (frequentemente listado em "Cirurgião", "Médico", "Dr.", "Dr(a).") com o nome do paciente. O nome do paciente geralmente está em um campo bem identificado como "Paciente:", "Nome:" ou "Beneficiário:".

2. Data do Atendimento/Cirurgia/Internação: Para telas de sistema, inclua a busca pelo termo "Data da Cirurgia:", "Data de Entrada", "Data Agendada", "Data Internação" ou "Dt. Cirurgia:". Conserve termos de etiquetas físicas como "Dt.Entr:", "Atend:", "Dt. Adm:", "Admissão:", "Internação:", etc.
3. Identificação do Convênio: Para telas de sistema, inclua a busca pelo termo "Classe:" ou "Classe de convênio" as sinônimo de convênio. Conserve termos de etiquetas físicas como 'Conv:', 'Convênio:', 'Plano:', 'OPERADORA'. Exemplos de convênios: Unimed, Bradesco Saúde, SulAmérica, Amil, Particular.
   * RECONHECIMENTO DE LOGOTIPO SEM TEXTO: Se a tela ou etiqueta tiver apenas um logotipo de operadora sem texto, reconheça a marca visualmente e retorne o nome do convênio (ex: logotipo do Bradesco → "Bradesco Saúde", logotipo da Unimed → "Unimed").
4. Ignorar Ruídos Visuais: Ignore botões, caixas de interface vazias, termos duplicados do layout de abas e textos secundários irrelevantes.
5. O campo "hospital" deve conter o nome do hospital, clínica ou sector, geralmente no topo, cabeçalho ou campo dedicado da tela.

Schema estruturado obrigatório (inclua *_confidence de 0-100):
{
  "nome_paciente": "STRING (Nome completo em MAIÚSCULAS do primeiro paciente ou principal)",
  "nome_paciente_confidence": NUMBER,
  "numero_atendimento": "STRING (Apenas os dígitos do ID de atendimento do primeiro paciente ou principal)",
  "numero_atendimento_confidence": NUMBER,
  "idade": NUMBER,
  "idade_confidence": NUMBER,
  "convenio": "STRING (Nome do convênio do primeiro paciente ou principal)",
  "convenio_confidence": NUMBER,
  "hospital": "STRING (Nome do hospital ou clínica)",
  "hospital_confidence": NUMBER,
  "data_nascimento": "STRING",
  "data_nascimento_confidence": NUMBER,
  "documentType": "etiqueta_hospitalar" | "nota_fiscal" | "outro",
  "summary": "STRING",
  "etiquetas": []
}`;
        }

        // Get few-shot dynamic reference examples
        const fewShotPrompt = await getFewShotPrompt(hospitalName);
        let activePromptPart = `Por favor, analise e extraia os dados estruturados do arquivo "${filename || 'documento'}" (${expectedType || 'autodetectar'}).${fewShotPrompt}`;
        if (isNfsByFilename) {
          activePromptPart += `\nAVISO IMPORTANTE: Este documento é uma Nota Fiscal de Serviço Eletrônica (NFS-e). Identifique a seção "TOMADOR DE SERVIÇOS" e preencha "emitente" e "cnpjEmitente" com os dados do TOMADOR (o hospital/cliente pagador). Extraia também a dataEmissao, numeroNota (ex: "991"), valorTotal, valorLiquido e itens.`;
        }

        // 1. Try Gemini models sequentially
        for (const modelName of models) {
          try {
            console.log(`[Direct Extraction] Tentando modelo Gemini: ${modelName}...`);
            
            const filePart = {
              inlineData: {
                mimeType: mimeType || "image/jpeg",
                data: fileBase64
              }
            };

            const responseSchema = {
              type: Type.OBJECT,
              properties: {
                documentType: { type: Type.STRING },
                summary: { type: Type.STRING },
                nome_paciente: { type: Type.STRING },
                nome_paciente_confidence: { type: Type.NUMBER },
                numero_atendimento: { type: Type.STRING },
                numero_atendimento_confidence: { type: Type.NUMBER },
                idade: { type: Type.NUMBER },
                idade_confidence: { type: Type.NUMBER },
                convenio: { type: Type.STRING },
                convenio_confidence: { type: Type.NUMBER },
                hospital: { 
                  type: Type.STRING,
                  description: "Nome do hospital ou clínica, geralmente na primeira linha ou cabeçalho da etiqueta hospitalar."
                },
                hospital_confidence: { type: Type.NUMBER },
                data_nascimento: { type: Type.STRING },
                data_nascimento_confidence: { type: Type.NUMBER },
                data_atendimento: {
                  type: Type.STRING,
                  description: "Data de entrada/atendimento/internação/cirurgia do paciente, geralmente identificada na etiqueta por rótulos como 'Dt.Entr:', 'Dt. Entr:', 'Data Entrada:', 'Atend:', 'Dt. Adm:', 'Admissão:' ou 'Internação:'. Formato esperado: string como aparece na etiqueta (ex: '05/06/2026'). NUNCA confunda com a data de nascimento (geralmente rotulada como 'Dt.Nasc:' ou 'Nasc:')."
                },
                data_atendimento_confidence: { type: Type.NUMBER },
                etiquetas: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      nome_paciente: { type: Type.STRING },
                      nome_paciente_confidence: { type: Type.NUMBER },
                      numero_atendimento: { type: Type.STRING },
                      numero_atendimento_confidence: { type: Type.NUMBER },
                      idade: { type: Type.NUMBER },
                      idade_confidence: { type: Type.NUMBER },
                      convenio: { type: Type.STRING },
                      convenio_confidence: { type: Type.NUMBER },
                      hospital: { 
                        type: Type.STRING,
                        description: "Nome do hospital ou clínica, geralmente na primeira linha ou cabeçalho da etiqueta hospitalar."
                      },
                      hospital_confidence: { type: Type.NUMBER },
                      data_nascimento: { type: Type.STRING },
                      data_nascimento_confidence: { type: Type.NUMBER },
                      data_atendimento: {
                        type: Type.STRING,
                        description: "Data de entrada/atendimento/internação/cirurgia do paciente, geralmente identificada na etiqueta por rótulos como 'Dt.Entr:', 'Dt. Entr:', 'Data Entrada:', 'Atend:', 'Dt. Adm:', 'Admissão:' ou 'Internação:'. Formato esperado: string como aparece na etiqueta (ex: '05/06/2026'). NUNCA confunda com a data de nascimento (geralmente rotulada como 'Dt.Nasc:' ou 'Nasc:')."
                      },
                      data_atendimento_confidence: { type: Type.NUMBER }
                    }
                  }
                },
                numeroNota: { 
                  type: Type.STRING, 
                  description: "O número identificador único da Nota Fiscal (ex: encontre o número destacado como '991', 'Número da Nota', 'Nota n°'). Deixe em branco se for etiqueta." 
                },
                numeroNota_confidence: { type: Type.NUMBER },
                dataEmissao: { 
                  type: Type.STRING, 
                  description: "A data de emissão exata da Nota Fiscal no formato DD/MM/AAAA ou AAAA-MM-DD. Deve ser extraída de campos como 'Data e Hora da emissão' ou similar (ex: se no texto diz 'Data e Hora da emissão: 15/05/2026 12:24:08', extraia exatamente '15/05/2026'). Deixe em branco se for etiqueta." 
                },
                dataEmissao_confidence: { type: Type.NUMBER },
                emitente: { 
                  type: Type.STRING, 
                  description: "ATENÇÃO OBRIGATÓRIA: Para Notas Fiscais (NFS-e/Prefeitura/Nibo), preencha este campo OBRIGATORIAMENTE com a razão social ou nome do TOMADOR DE SERVIÇOS (o hospital ou contratante listado na nota como tomador/cliente, ex: 'ASSOCIACAO HOSPITALAR FILHAS DE NOSSA SENHORA DO MONTE CALVARIO'). NUNCA preencha com o emitente/prestador original de serviços médicos. Deixe em branco se for etiqueta." 
                },
                emitente_confidence: { type: Type.NUMBER },
                cnpjEmitente: { 
                  type: Type.STRING, 
                  description: "ATENÇÃO OBRIGATÓRIA: Para Notas Fiscais, preencha este campo OBRIGATORIAMENTE com o CNPJ do TOMADOR DE SERVIÇOS (o hospital ou contratante listado como tomador/cliente). NUNCA preencha com o CNPJ do prestador. Deixe em branco se for etiqueta." 
                },
                cnpjEmitente_confidence: { type: Type.NUMBER },
                valorTotal: { 
                  type: Type.STRING, 
                  description: "O valor total bruto ou dos serviços faturados na Nota Fiscal (ex: 'R$ 1.500,00' ou '1500,00'). Deixe em branco ou zerado se for etiqueta." 
                },
                valorTotal_confidence: { type: Type.NUMBER },
                valorLiquido: {
                  type: Type.NUMBER,
                  description: "Valor líquido EXPLICITAMENTE escrito no documento na linha 'Valor Líquido: R$ X' (geralmente dentro da seção 'Discriminação do Serviço', não na tabela de cálculo de impostos no rodapé). Copie esse número exatamente como está escrito. NÃO calcule ou deduza este valor — apenas leia o que está escrito após 'Valor Líquido:'."
                },
                valorLiquido_confidence: { type: Type.NUMBER },
                itens: {
                  type: Type.ARRAY,
                  description: "Array dos itens ou serviços de auditoria/consultoria médica faturados na nota.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      descricao: { type: Type.STRING },
                      quantidade: { type: Type.NUMBER },
                      valorUnitario: { type: Type.NUMBER },
                      valorTotal: { type: Type.NUMBER }
                    }
                  }
                }
              },
              required: ["documentType", "summary", "etiquetas"]
            };

            const result = await generateGeminiContentWithRetry(
              modelName,
              [filePart, activePromptPart],
              systemPrompt,
              "application/json",
              responseSchema
            );

            if (result.text) {
              resultData = JSON.parse(result.text.trim());
              success = true;
              usedModel = `${modelName} (${result.usedKey})`;
              usedProvider = "gemini";
              quotaExhausted = !!result.quotaExhausted;
              console.log(`[Direct Extraction] Sucesso com o modelo Gemini: ${modelName} usando a chave ${result.usedKey}`);
              break;
            }
          } catch (err: any) {
            console.warn(`[Direct Extraction] Falha com o modelo Gemini ${modelName}:`, err.message);
            errorMsg = err.message || "Erro desconhecido no Gemini";
          }
        }

        // 2. OCR + Groq Fallback if Gemini failed (e.g. 429)
        if (!success) {
          console.log("[Direct Extraction] Todos os modelos Gemini falharam. Iniciando fallback para Groq com OCR... ");
          const groqApiKey = process.env.GROQ_API_KEY;
          if (!groqApiKey) {
            throw new Error(`Gemini falhou (${errorMsg}) e GROQ_API_KEY não está configurada para fallback.`);
          }

          if (!extractedText || extractedText.trim().length === 0) {
            extractedText = "[OCR não retornou texto detectável preliminarmente]";
          }

          console.log(`[Direct Extraction Back] Enviando texto extraído para Groq llama-3.3-70b-versatile. Tamanho do texto: ${extractedText.length}`);

          const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqApiKey}`
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: `${systemPrompt}\n\nVocê deve analisar o texto bruto extraído via OCR abaixo e retornar OBRIGATORIAMENTE um objeto JSON puro atendendo precisamente aos schemas definidos de etiquetas ou notas fiscais.`
                },
                {
                  role: "user",
                  content: `Aqui está o texto bruto extraído:\n\n${extractedText}`
                }
              ],
              temperature: 0.1
            })
          });

          if (!groqResponse.ok) {
            const groqErrText = await groqResponse.text();
            throw new Error(`Falha na API da Groq: ${groqResponse.status} - ${groqErrText}`);
          }

          const groqData = await groqResponse.json();
          const groqResultText = groqData.choices[0].message.content;
          
          if (groqResultText) {
            resultData = JSON.parse(groqResultText.trim());
            success = true;
            usedModel = "llama-3.3-70b-versatile";
            usedProvider = "groq";
            console.log("[Direct Extraction Back] Sucesso com o fallback Groq llama-3.3-70b-versatile!");
          }
        }
      }

      if (!success) {
        console.log(`[Direct Extraction Contingency] Ativando heurística local de contingência para "${filename}"`);
        resultData = getHeuristicFallback(filename, expectedType);
        success = true;
        usedModel = "Heurístico (Cota Contingência)";
        usedProvider = "heuristica";
      }

      // Unify Schema and Filter Name Contamination
      resultData = normalizeExtractionData(resultData);
      console.log("Pacientes recebidos da IA:", resultData?.etiquetas?.length || 0);

      // Register Learning Log for Stats Panel (Background operation - no await for rapid response)
      try {
        db.collection("learning_logs").add({
          timestamp: new Date(),
          hospital: hospitalName,
          provider: usedProvider,
          model: usedModel
        }).catch(err => console.error("Erro ao salvar log de aprendizado em segundo plano:", err));
      } catch (logErr) {
        console.error("Erro ao registrar log de aprendizado:", logErr);
      }

      // Save to learned_examples if extracted from Gemini/Groq (Background operation - no await)
      if (usedProvider === "gemini" || usedProvider === "groq") {
        saveLearnedExample(fileBase64, resultData, extractedText)
          .catch(err => console.error("Erro ao salvar exemplo aprendido em segundo plano:", err));
      }

      return res.status(200).json({
        success: true,
        documentType: resultData.documentType || "outro",
        summary: resultData.summary || "Relatório gerado automaticamente por IA.",
        data: resultData,
        usedModel: usedModel,
        usedProvider: usedProvider,
        quotaExhausted: quotaExhausted
      });

    } catch (err: any) {
      console.error("[Direct Extraction Back Error] Erro geral no extrator:", err);
      const isQuota = err.status === 429 || String(err.message).includes("Cota de processamento");
      return res.status(isQuota ? 429 : 500).json({
        success: false,
        error: err.message || "Erro crítico durante a extração de dados.",
        usedModel: "N/A",
        usedProvider: "gemini",
        quotaExhausted: isQuota
      });
    }
  });

  // Proxy route for chat/analysis that allows custom prompts
  apiRouter.post("/gemini/analyze", async (req, res) => {
    try {
      const { prompt, context, fileName, modelStrategy } = req.body;
      
      let models = ["gemini-3.1-pro-preview", "gemini-flash-latest", "gemini-3.5-flash"];
      
      if (!modelStrategy || modelStrategy === 'rotation') {
        const offset = analyzeRequestCount % models.length;
        analyzeRequestCount++;
        models = [
          ...models.slice(offset),
          ...models.slice(0, offset)
        ];
        console.log(`[Model Rotation Analyze] Revezamento ativo! Ordem de tentativa: ${models.join(", ")}`);
      }
      
      const systemInstruction = `Você é o DocEngine Auditor AI, um assistente virtual especializado em auditoria de faturamento hospitalar.
Sua missão é ajudar o faturista ou auditor a entender divergências entre o que foi pedido (Etiqueta/Guia) e o que foi cobrado (Nota Fiscal/Lote).

Diretrizes:
- Seja técnico, preciso e consultivo.
- Use tabelas Markdown se necessário.
- Se houver divergência de nome, CPF ou valores, destaque de forma clara.
- Baseie-se nos dados fornecidos do documento ${fileName || 'atual'}.
- Se o usuário perguntar algo fora do contexto hospitalar, tente trazer de volta para o faturamento.`;

      let usedModel = "";
      let success = false;
      let aiText = "";
      let quotaExhausted = false;

      // 1. Try Gemini
      for (const m of models) {
        try {
          console.log(`[Analyze] Tentando modelo Gemini: ${m}...`);
          const result = await generateGeminiContentWithRetry(
            m,
            [
              { text: `Contexto do Documento:\n${JSON.stringify(context || {}, null, 2)}` },
              { text: `Pergunta do Usuário:\n${prompt}` }
            ],
            systemInstruction
          );
          
          if (result.text) {
            aiText = result.text;
            usedModel = `${m} (${result.usedKey})`;
            quotaExhausted = !!result.quotaExhausted;
            success = true;
            break;
          }
        } catch (err: any) {
          console.warn(`[Analyze] Falha com o modelo Gemini ${m}:`, err.message);
        }
      }

      // 2. Fallback Heurístico
      if (!success) {
         console.log(`[Analyze Contingency] Ativando análise heurística de contingência.`);
         aiText = getHeuristicAnalysis(fileName, prompt);
         usedModel = "Heurístico (Cota Contingência)";
      }

      res.status(200).json({
        text: aiText,
        usedModel: usedModel,
        quotaExhausted: quotaExhausted
      });

    } catch (err: any) {
      console.error("[Analyze Error]:", err);
      const isQuota = err.status === 429 || String(err.message).includes("Cota de processamento");
      res.status(isQuota ? 429 : 500).json({
        error: err.message || "Erro durante análise AI.",
        quotaExhausted: isQuota
      });
    }
  });



  // --- Health Check Route ---
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api", apiRouter);

  // Error handling for /api routes
  app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error(`[API Error] ${req.method} ${req.url}:`, err);
    res.status(err.status || 500).json({
      success: false,
      error: err.message || "Internal Server Error",
      code: err.code || "SERVER_ERROR"
    });
  });

  // Serve Vite or Static files depending on ENV
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Iniciando servidor de desenvolvimento com middleware do Vite.");
  } else {
    // In production, esbuild bundles server.ts into dist/server.cjs.
    // If running from the bundle, __dirname is the dist folder itself and contains index.html.
    // That makes it the most robust reference regardless of the process working directory on Render.
    const distPath = fs.existsSync(path.join(__dirname, 'index.html'))
      ? __dirname
      : path.join(process.cwd(), 'dist');
    
    // Logging middleware for production debugging
    app.use((req, res, next) => {
      if (req.url !== '/' && !req.url.startsWith('/api/')) {
        // console.log(`[Static] ${req.method} ${req.url}`);
      }
      next();
    });

    app.use(express.static(distPath, {
      maxAge: '1d',
      etag: true
    }));

    app.get('*', (req, res) => {
      // If it's a request for a file (has extension) or an API, and we reached here, it's a 404
      if (req.url.includes('.') || req.url.startsWith('/api/')) {
        return res.status(404).send('Not Found');
      }
      
      // Otherwise, it's a client-side route, serve index.html
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Iniciando servidor de produção com arquivos estáticos.");
  }

  async function warmUpPdfParser() {
    const tStart = performance.now();
    try {
      await import("pdf-parse");
      console.log(`[WARMUP] pdf-parse pré-carregado em ${(performance.now() - tStart).toFixed(2)}ms`);
    } catch (err) {
      console.error("[WARMUP] Falha ao pré-carregar pdf-parse:", err);
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    warmUpPdfParser();
  });

  // Self-ping to prevent sleep on Render (every 10 minutes)
  setInterval(() => {
    const url = "https://audit-ai-6wed.onrender.com/health";
    console.log(`[Self-Ping] Fazendo ping para manter o servidor ativo: ${url}`);
    fetch(url)
      .then(res => {
        console.log(`[Self-Ping] Resposta recebida. Status: ${res.status}`);
      })
      .catch(err => {
        console.error(`[Self-Ping] Erro ao fazer ping:`, err.message || err);
      });
  }, 10 * 60 * 1000); // 10 minutes
}

startServer();
