const express = require("express");
const admin = require("firebase-admin");
const { getDB } = require("../utils/db");
const { v4: uuidv4 }          = require("uuid");
const { upload }              = require("../utils/upload");
const { parseDocument }       = require("../parsers");
const { reconcilePatients }   = require("../engine/health");

const router = express.Router();

/**
 * POST /reconcile
 * Reconcilia lista de pacientes com relatório do hospital.
 *
 * Identifica para cada paciente: PAGO, PENDENTE, PARCIAL, GLOSA, NÃO ENCONTRADO
 * Localiza pelo número de atendimento E/OU nome do paciente.
 *
 * multipart/form-data:
 *   patients       — arquivo com a lista de pacientes (xlsx, csv, pdf)
 *   hospital       — arquivo com o relatório do hospital (xlsx, csv, pdf)
 *   matchBy        — "atendimento" | "nome" | "ambos" (padrão: ambos)
 *   nameSimilarity — 0.0–1.0 threshold nome fuzzy (padrão: 0.75)
 *   tolerance      — tolerância de valor em R$ (padrão: 0.01)
 *   tableIndexPatients — índice da aba/tabela na planilha de pacientes (padrão: 0)
 *   tableIndexHospital — índice da aba/tabela no relatório do hospital (padrão: 0)
 */
router.post("/", upload.fields([
  { name: "patients", maxCount: 1 },
  { name: "hospital", maxCount: 1 }
]), async (req, res, next) => {
  try {
    const filePatients = req.files?.patients?.[0];
    const fileHospital = req.files?.hospital?.[0];

    if (!filePatients || !fileHospital) {
      return res.status(400).json({
        success: false,
        error:   "Envie dois arquivos: 'patients' (lista de pacientes) e 'hospital' (relatório).",
        code:    "MISSING_FILES",
        hint:    "Formatos aceitos: xlsx, csv, pdf"
      });
    }

    const { appId }  = req.appContext;
    const auditId    = uuidv4();
    const startTime  = Date.now();

    const {
      matchBy              = "ambos",
      nameSimilarity       = "0.75",
      tolerance            = "0.01",
      tableIndexPatients   = "0",
      tableIndexHospital   = "0"
    } = req.body;

    // ── 1. Parse dos dois arquivos ───────────────────────────────────────
    const [parsedPatients, parsedHospital] = await Promise.all([
      parseDocument(filePatients.buffer, filePatients.originalname, filePatients.mimetype),
      parseDocument(fileHospital.buffer, fileHospital.originalname, fileHospital.mimetype)
    ]);

    // ── 2. Seleciona a tabela correta de cada arquivo ────────────────────
    const tblIdxP = parseInt(tableIndexPatients) || 0;
    const tblIdxH = parseInt(tableIndexHospital) || 0;

    const tablePatients = parsedPatients.tables?.[tblIdxP];
    const tableHospital = parsedHospital.tables?.[tblIdxH];

    if (!tablePatients || tablePatients.rows.length === 0) {
      return res.status(422).json({
        success: false,
        error:   "Não foi possível extrair uma tabela do arquivo de pacientes.",
        code:    "NO_TABLE_PATIENTS",
        hint:    `Arquivo "${filePatients.originalname}" — tente tableIndexPatients=0,1,2...`,
        availableTables: parsedPatients.tables?.map((t, i) => ({
          index: i, name: t.sheetName, rows: t.rows.length, headers: t.headers
        }))
      });
    }

    if (!tableHospital || tableHospital.rows.length === 0) {
      return res.status(422).json({
        success: false,
        error:   "Não foi possível extrair uma tabela do relatório do hospital.",
        code:    "NO_TABLE_HOSPITAL",
        hint:    `Arquivo "${fileHospital.originalname}" — tente tableIndexHospital=0,1,2...`,
        availableTables: parsedHospital.tables?.map((t, i) => ({
          index: i, name: t.sheetName, rows: t.rows.length, headers: t.headers
        }))
      });
    }

    // ── 2.5. Filtra por Atividade se houver coluna Atividade ──────────────
    if (tableHospital && Array.isArray(tableHospital.rows)) {
      const isMedNote = appId && (appId.toLowerCase().includes("note") || appId.toLowerCase().includes("cirur"));
      const expectedAtividade = isMedNote ? "CIRURGICO" : "CLINICO";
      
      console.log(`[Reconcile Route] App Context ID: ${appId}. Esperado Atividade: ${expectedAtividade}`);
      
      const originalCount = tableHospital.rows.length;
      const filteredRows = tableHospital.rows.filter(row => {
        const atividadeKey = Object.keys(row).find(k => k.toLowerCase() === "atividade");
        if (!atividadeKey) return true; // Se não tem coluna Atividade, mantém
        
        const val = String(row[atividadeKey]).trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (expectedAtividade === "CLINICO") {
          return val === "CLINICO";
        } else {
          // Para CIRURGICO (MedNote), aceita qualquer coisa que NÃO seja CLINICO
          return val !== "CLINICO";
        }
      });
      
      console.log(`[Reconcile Route] Filtrados registros do hospital: ${filteredRows.length} de ${originalCount}`);
      tableHospital.rows = filteredRows;
    }

    // ── 3. Reconcilia ────────────────────────────────────────────────────
    const reconciliation = reconcilePatients(tablePatients, tableHospital, {
      matchByAtendimento: matchBy === "atendimento" || matchBy === "ambos",
      matchByName:        matchBy === "nome"        || matchBy === "ambos",
      nameSimilarity:     parseFloat(nameSimilarity) || 0.75,
      tolerance:          parseFloat(tolerance)      || 0.01
    });

    // ── 4. Monta listas filtradas para facilitar consumo nos apps ────────
    const pagos          = reconciliation.results.filter(r => r.status === "PAGO");
    const pendentes      = reconciliation.results.filter(r => r.status === "PENDENTE");
    const parciais       = reconciliation.results.filter(r => r.status === "PARCIAL");
    const glosas         = reconciliation.results.filter(r => r.status === "GLOSA");
    const naoEncontrados = reconciliation.results.filter(r => r.status === "NÃO ENCONTRADO");
    const duplicados     = reconciliation.results.filter(r => r.status === "DUPLICADO");

    // ── 5. Registra no Firestore ─────────────────────────────────────────
    await getDB().collection("audits").doc(auditId).set({
      auditId,
      appId,
      type:           "reconcile_patients",
      filePatients:   filePatients.originalname,
      fileHospital:   fileHospital.originalname,
      totalPacientes: reconciliation.summary.totalPacientes,
      pagos:          reconciliation.summary.pagos,
      pendentes:      reconciliation.summary.pendentes,
      glosas:         reconciliation.summary.glosas,
      status:         reconciliation.summary.status,
      processingMs:   Date.now() - startTime,
      createdAt:      admin.firestore.FieldValue.serverTimestamp()
    });

    // ── 6. Resposta ───────────────────────────────────────────────────────
    return res.status(200).json({
      success:     true,
      auditId,
      processingMs: Date.now() - startTime,

      // Arquivos processados
      files: {
        patients: {
          name:    filePatients.originalname,
          rows:    tablePatients.rows.length,
          headers: tablePatients.headers,
          sheet:   tablePatients.sheetName
        },
        hospital: {
          name:    fileHospital.originalname,
          rows:    tableHospital.rows.length,
          headers: tableHospital.headers,
          sheet:   tableHospital.sheetName
        }
      },

      // Campos detectados automaticamente
      detectedFields: {
        patients: reconciliation.detectedFields.patients,
        hospital: reconciliation.detectedFields.hospital
      },

      // Sumário executivo
      summary: reconciliation.summary,

      // Listas por status (para filtrar no app)
      pagos,
      pendentes,
      parciais,
      glosas,
      naoEncontrados,
      duplicados,
      extrasNoHospital: reconciliation.notInPatientList,

      // Lista completa com todos os status
      allResults: reconciliation.results
    });

  } catch (err) {
    next(err);
  }
});

/**
 * POST /reconcile/from-ids
 * Versão que recebe os dados já extraídos (sem arquivos).
 * Útil quando o app já tem os dados em memória.
 *
 * Body JSON:
 * {
 *   "patients": [ { "numero_atendimento": "12345", "nome": "João", "valor": 500 }, ... ],
 *   "hospital":  [ { "atendimento": "12345", "paciente": "João Silva", "pago": 500 }, ... ],
 *   "options": { "matchBy": "ambos", "nameSimilarity": 0.75 }
 * }
 */
router.post("/from-ids", express.json({ limit: "10mb" }), async (req, res, next) => {
  try {
    const { patients, hospital, options = {} } = req.body;

    if (!Array.isArray(patients) || !Array.isArray(hospital)) {
      return res.status(400).json({
        success: false,
        error:   "Envie 'patients' e 'hospital' como arrays JSON.",
        code:    "INVALID_INPUT"
      });
    }

    const { appId }  = req.appContext;
    const auditId    = uuidv4();

    const reconciliation = reconcilePatients(
      { rows: patients },
      { rows: hospital },
      {
        matchByAtendimento: options.matchBy !== "nome",
        matchByName:        options.matchBy !== "atendimento",
        nameSimilarity:     options.nameSimilarity || 0.75,
        tolerance:          options.tolerance      || 0.01
      }
    );

    await getDB().collection("audits").doc(auditId).set({
      auditId, appId, type: "reconcile_patients_json",
      totalPacientes: reconciliation.summary.totalPacientes,
      status: reconciliation.summary.status,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      success:  true,
      auditId,
      summary:  reconciliation.summary,
      pagos:         reconciliation.results.filter(r => r.status === "PAGO"),
      pendentes:     reconciliation.results.filter(r => r.status === "PENDENTE"),
      parciais:      reconciliation.results.filter(r => r.status === "PARCIAL"),
      glosas:        reconciliation.results.filter(r => r.status === "GLOSA"),
      naoEncontrados:reconciliation.results.filter(r => r.status === "NÃO ENCONTRADO"),
      extrasNoHospital: reconciliation.notInPatientList,
      allResults:    reconciliation.results
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;
