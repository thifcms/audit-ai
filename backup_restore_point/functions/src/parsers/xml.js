const { XMLParser } = require("fast-xml-parser");

const XML_OPTIONS = {
  ignoreAttributes:       false,
  attributeNamePrefix:    "@_",
  textNodeName:           "#text",
  parseAttributeValue:    true,
  parseTagValue:          true,
  trimValues:             true,
  ignoreDeclaration:      true,
  numberParseOptions:     { leadingZeros: false, hex: false }
};

/**
 * Parser de XML com suporte especial a NFe, CTe, MDFe.
 */
async function parse(buffer, filename) {
  const xmlText = buffer.toString("utf-8").trim();
  const parser  = new XMLParser(XML_OPTIONS);

  let parsed;
  try {
    parsed = parser.parse(xmlText);
  } catch (err) {
    throw Object.assign(
      new Error(`Falha ao parsear XML "${filename}": ${err.message}`),
      { code: "XML_PARSE_ERROR", status: 422 }
    );
  }

  // Detecta tipo de documento fiscal
  const docType = detectXMLDocType(parsed, xmlText);

  let fields = {};
  let tables = [];

  if (docType === "NFe") {
    const nfeData = extractNFe(parsed);
    fields = nfeData.fields;
    tables = nfeData.tables;
  } else if (docType === "CTe") {
    fields = extractCTe(parsed);
  } else {
    // XML genérico: achata estrutura
    fields = flattenXML(parsed);
    tables = extractTablesFromXML(parsed);
  }

  return {
    type: "xml",
    text: xmlText,
    tables,
    fields,
    meta: {
      docType,
      encoding: detectEncoding(xmlText),
      size:     xmlText.length
    }
  };
}

/** Detecta o tipo de documento XML */
function detectXMLDocType(parsed, text) {
  if (text.includes("<NFe") || text.includes("<nfeProc")) return "NFe";
  if (text.includes("<CTe"))  return "CTe";
  if (text.includes("<MDFe")) return "MDFe";
  if (text.includes("<SPED")) return "SPED";
  return "XML_GENERICO";
}

/** Extrai dados completos de uma NFe */
function extractNFe(parsed) {
  try {
    const root  = parsed.nfeProc?.NFe || parsed.NFe || parsed;
    const infNFe = root?.NFe?.infNFe || root?.infNFe || {};
    const ide    = infNFe.ide    || {};
    const emit   = infNFe.emit   || {};
    const dest   = infNFe.dest   || {};
    const total  = infNFe.total?.ICMSTot || {};
    const transp = infNFe.transp || {};
    const cobr   = infNFe.cobr  || {};

    const prodArray = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det].filter(Boolean);

    const fields = {
      // Identificação
      chaveAcesso:    infNFe["@_Id"]?.replace("NFe", "") || "",
      numero:         ide.nNF,
      serie:          ide.serie,
      dataEmissao:    ide.dhEmi,
      naturezaOp:     ide.natOp,
      tipoNF:         ide.tpNF === 1 ? "Saída" : "Entrada",
      finalidade:     ide.finNFe,

      // Emitente
      emitente: {
        cnpj:         emit.CNPJ,
        nome:         emit.xNome,
        fantasia:     emit.xFant,
        ie:           emit.IE,
        municipio:    emit.enderEmit?.xMun,
        uf:           emit.enderEmit?.UF,
        cep:          emit.enderEmit?.CEP
      },

      // Destinatário
      destinatario: {
        cnpjCpf:      dest.CNPJ || dest.CPF,
        nome:         dest.xNome,
        ie:           dest.IE,
        municipio:    dest.enderDest?.xMun,
        uf:           dest.enderDest?.UF
      },

      // Totais
      totais: {
        vBC:          total.vBC,
        vICMS:        total.vICMS,
        vICMSDeson:   total.vICMSDeson,
        vIPI:         total.vIPI,
        vPIS:         total.vPIS,
        vCOFINS:      total.vCOFINS,
        vProd:        total.vProd,
        vFrete:       total.vFrete,
        vSeg:         total.vSeg,
        vDesc:        total.vDesc,
        vNF:          total.vNF,
        vTotTrib:     total.vTotTrib
      },

      // Cobrança
      cobranca: {
        nFat:         cobr.fat?.nFat,
        vOrig:        cobr.fat?.vOrig,
        vDesc:        cobr.fat?.vDesc,
        vLiq:         cobr.fat?.vLiq
      }
    };

    // Tabela de produtos
    const productHeaders = ["Item", "Código", "Descrição", "NCM", "CFOP", "Un", "Qtd", "VlrUnit", "VlrTotal", "ICMS%", "IPI%"];
    const productRows    = prodArray.map((det, i) => {
      const prod = det?.prod || {};
      const imp  = det?.imposto || {};
      return {
        Item:       i + 1,
        Código:     prod.cProd,
        Descrição:  prod.xProd,
        NCM:        prod.NCM,
        CFOP:       prod.CFOP,
        Un:         prod.uCom,
        Qtd:        prod.qCom,
        VlrUnit:    prod.vUnCom,
        VlrTotal:   prod.vProd,
        "ICMS%":    imp.ICMS?.ICMS60?.pICMS || imp.ICMS?.ICMS00?.pICMS || "",
        "IPI%":     imp.IPI?.IPITrib?.pIPI || ""
      };
    });

    return {
      fields,
      tables: [{
        sheetName: "Produtos NFe",
        headers:   productHeaders,
        rows:      productRows,
        summary:   { totalRows: productRows.length, totalColumns: productHeaders.length, numericFields: {} }
      }]
    };
  } catch (err) {
    console.warn("[XMLParser] Erro ao extrair NFe:", err.message);
    return { fields: flattenXML(parsed), tables: [] };
  }
}

/** Extrai dados de CTe */
function extractCTe(parsed) {
  try {
    const infCte = parsed.cteProc?.CTe?.infCte || parsed.CTe?.infCte || {};
    return {
      chave:      infCte["@_Id"]?.replace("CTe", "") || "",
      numero:     infCte.ide?.nCT,
      emitenteCnpj: infCte.emit?.CNPJ,
      emitenteNome: infCte.emit?.xNome,
      valorTotal:   infCte.vPrest?.vTPrest
    };
  } catch {
    return flattenXML(parsed);
  }
}

/** Achata XML genérico em objeto plano */
function flattenXML(obj, prefix = "", result = {}) {
  for (const [key, value] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      flattenXML(value, fullKey, result);
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

/** Tenta extrair arrays como tabelas em XML genérico */
function extractTablesFromXML(obj, depth = 0) {
  if (depth > 5) return [];
  const tables = [];
  for (const [key, value] of Object.entries(obj || {})) {
    if (Array.isArray(value) && value.length > 1 && typeof value[0] === "object") {
      const headers = [...new Set(value.flatMap(r => Object.keys(r)))];
      tables.push({
        sheetName: key,
        headers,
        rows: value,
        summary: { totalRows: value.length, totalColumns: headers.length, numericFields: {} }
      });
    } else if (typeof value === "object") {
      tables.push(...extractTablesFromXML(value, depth + 1));
    }
  }
  return tables;
}

function detectEncoding(text) {
  if (text.includes('encoding="UTF-8"') || text.includes("encoding='UTF-8'")) return "UTF-8";
  if (text.includes("ISO-8859")) return "ISO-8859-1";
  return "UTF-8";
}

module.exports = { parse };
