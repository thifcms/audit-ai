/**
 * BASE DE CONHECIMENTO EMBUTIDA
 * A IA já nasce treinada para ler qualquer documento.
 * Não precisa de /train para funcionar.
 * O /train só é necessário para adicionar padrões específicos do SEU negócio.
 */

const BUILTIN_KNOWLEDGE = {

  // ── SYSTEM PROMPT PRINCIPAL ──────────────────────────────────────────────
  systemPrompt: `Você é DocEngine, uma IA especialista em leitura e extração de dados
de documentos empresariais brasileiros e internacionais.

VOCÊ CONHECE E SABE EXTRAIR:

[SAÚDE E HOSPITALAR]
- Lista de pacientes (convênio, secretaria, consultório)
- Relatório de faturamento hospitalar e espelho de pagamento
- TISS, SADT, Guias de consulta, internação, honorários médicos
- Contas hospitalares (APAC, AIH, BPA), relatórios de glosas
- Faturas de operadoras (Unimed, Amil, Bradesco Saúde, SulAmérica, Prevent Senior...)
- Prontuários, laudos, resumo de alta, tabela TUSS/CBHPM
- Campos: nº atendimento, nº guia, nome paciente, carteirinha, CID-10, TUSS, valor cobrado/pago/glosado, status

[FISCAL BRASIL]
- NFe (Nota Fiscal Eletrônica) — layout XML e PDF DANFE
- CTe (Conhecimento de Transporte Eletrônico)
- MDFe (Manifesto de Documentos Fiscais)
- NFCe (Nota Fiscal Consumidor)
- NFS-e (Nota Fiscal de Serviços)
- SPED Fiscal e Contábil
- GNRE, GIA, DARF, GPS, GFIP
- Nota Fiscal avulsa (papel), Nota Fiscal de Produtor

[FINANCEIRO E CONTÁBIL]
- Extratos bancários (Bradesco, Itaú, BB, Caixa, Santander, Nubank, Inter, Sicredi...)
- Balancetes de verificação
- Balanço Patrimonial (BP)
- Demonstração de Resultado (DRE)
- Demonstração de Fluxo de Caixa (DFC)
- Livro Caixa
- Conciliação bancária
- Boletos bancários (linha digitável, código de barras)
- Cheques
- Comprovantes de TED/PIX/DOC/transferência
- Faturas de cartão de crédito

[TRABALHISTA E RH]
- Holerite / Folha de pagamento
- Recibo de férias
- Rescisão de contrato (TRCT)
- CAGED, eSocial
- FGTS (extrato, GRRF)
- INSS (GFIP, CNIS)
- Declaração de IR pessoa física
- Certidões negativas (CND, CNDT)

[CONTRATOS E JURÍDICO]
- Contratos de prestação de serviço
- Contratos sociais / Estatutos
- Procurações
- Atas de reunião
- Termos de distrato
- Certidões (nascimento, casamento, imóvel)
- Escrituras

[LOGÍSTICA E COMÉRCIO]
- Pedidos de compra / venda
- Ordens de serviço
- Conhecimento de embarque (BL, AWB)
- Packing list
- Certificados de origem
- Romaneios
- Recibos de entrega
- Notas de devolução

[MÉDICO E SEGUROS]
- Laudos médicos
- Receitas médicas
- TISS / TUSS (saúde suplementar)
- Apólices de seguro
- Sinistros

[IMAGENS E FOTOS]
- Fotos de documentos em qualquer ângulo
- Documentos parcialmente visíveis
- Baixa qualidade / desfocado — tenta extrair mesmo assim
- Recibos de mão escrita
- Cupons fiscais (papel térmico)
- Etiquetas de produtos / códigos de barras

REGRAS DE EXTRAÇÃO:
1. Extraia APENAS o que está no documento — nunca invente dados
2. Valores monetários → número puro (ex: 1234.56, não "R$ 1.234,56")
3. Datas → ISO 8601 (YYYY-MM-DD)
4. CNPJ → somente números (14 dígitos)
5. CPF → somente números (11 dígitos)
6. Se campo não existir → null (nunca string vazia)
7. Percentuais → número puro (ex: 18.5, não "18,5%")
8. Retorne APENAS JSON válido — sem texto antes ou depois`,

  // ── PADRÕES POR TIPO DE DOCUMENTO ───────────────────────────────────────
  documentTypes: [
    "NFe", "CTe", "MDFe", "NFCe", "NFS-e", "DANFE",
    "Extrato Bancário", "Boleto", "Comprovante PIX", "Comprovante TED",
    "Balancete", "Balanço Patrimonial", "DRE", "DFC", "Livro Caixa",
    "Holerite", "Rescisão", "Recibo de Férias", "FGTS", "INSS",
    "Contrato", "Procuração", "Ata", "Certidão",
    "Pedido de Compra", "Ordem de Serviço", "Romaneio",
    "Laudo Médico", "Receita Médica", "Apólice",
    "Declaração IR", "DARF", "GPS", "GNRE",
    "Fatura Cartão", "Nota de Devolução", "Recibo",
    // Saúde
    "Lista de Pacientes", "Relatório Hospitalar", "Espelho de Pagamento",
    "Guia TISS", "SADT", "Conta Hospitalar", "Relatório de Glosas",
    "Fatura Convênio", "Laudo Médico", "Resumo de Alta",
    "Planilha Financeira", "Relatório", "Orçamento"
  ],

  // ── CAMPOS-CHAVE POR CATEGORIA ───────────────────────────────────────────
  keyFields: {
    // Fiscal
    chaveAcesso:     { description: "Chave de acesso NFe (44 dígitos)", format: "44 dígitos numéricos" },
    numeroNF:        { description: "Número da Nota Fiscal",            format: "inteiro" },
    serie:           { description: "Série da NF",                      format: "inteiro" },
    cfop:            { description: "Código Fiscal de Operações",       format: "4 dígitos" },
    ncm:             { description: "Nomenclatura Comum do Mercosul",   format: "8 dígitos" },
    cst:             { description: "Código de Situação Tributária",    format: "2-3 dígitos" },
    naturezaOp:      { description: "Natureza da operação",             format: "texto" },

    // Entidades
    cnpjEmitente:    { description: "CNPJ do emitente",      format: "14 dígitos" },
    nomeEmitente:    { description: "Razão social emitente", format: "texto" },
    cnpjDestinatario:{ description: "CNPJ destinatário",     format: "14 dígitos" },
    nomeDestinatario:{ description: "Razão social dest.",    format: "texto" },
    cpfTitular:      { description: "CPF do titular",        format: "11 dígitos" },

    // Datas
    dataEmissao:     { description: "Data de emissão",      format: "YYYY-MM-DD" },
    dataVencimento:  { description: "Data de vencimento",   format: "YYYY-MM-DD" },
    dataCompetencia: { description: "Competência",          format: "YYYY-MM" },
    dataPagamento:   { description: "Data do pagamento",    format: "YYYY-MM-DD" },

    // Valores
    valorTotal:      { description: "Valor total do documento", format: "número decimal" },
    valorProdutos:   { description: "Valor dos produtos",       format: "número decimal" },
    valorFrete:      { description: "Valor do frete",           format: "número decimal" },
    valorDesconto:   { description: "Valor do desconto",        format: "número decimal" },
    valorLiquido:    { description: "Valor líquido",            format: "número decimal" },

    // Tributos
    baseCalcICMS:    { description: "Base de cálculo ICMS", format: "número decimal" },
    aliquotaICMS:    { description: "Alíquota ICMS",        format: "número decimal (ex: 18)" },
    valorICMS:       { description: "Valor ICMS",           format: "número decimal" },
    valorIPI:        { description: "Valor IPI",            format: "número decimal" },
    valorPIS:        { description: "Valor PIS",            format: "número decimal" },
    valorCOFINS:     { description: "Valor COFINS",         format: "número decimal" },
    valorISS:        { description: "Valor ISS",            format: "número decimal" }
  },

  // ── EXEMPLOS PRONTOS (FEW-SHOT) ──────────────────────────────────────────
  examples: [
    {
      input: "NOTA FISCAL ELETRÔNICA - DANFE\nEMITENTE: Empresa ABC Ltda - CNPJ: 12.345.678/0001-90\nDESTINATÁRIO: XYZ Comércio SA - CNPJ: 98.765.432/0001-10\nNúmero: 000441 Série: 1 Data: 15/05/2026\nPRODUTO: Notebook Dell 16GB - Qtd: 2 - Vlr Unit: R$ 3.200,00\nTotal Produtos: R$ 6.400,00 | ICMS 18%: R$ 1.152,00 | Total NF: R$ 6.400,00",
      output: {
        documentType: "NFe",
        summary: "Nota Fiscal de venda de 2 Notebooks Dell, valor total R$ 6.400,00",
        keyFields: { numeroNF: 441, serie: 1 },
        entities: {
          emitter:   { nome: "Empresa ABC Ltda",  cnpjCpf: "12345678000190" },
          recipient: { nome: "XYZ Comércio SA",   cnpjCpf: "98765432000110" }
        },
        financials: {
          totalValue: 6400.00, currency: "BRL",
          taxes: { icms: 1152.00, ipi: null, pis: null, cofins: null, iss: null },
          discounts: null, netValue: 6400.00
        },
        dates: { emission: "2026-05-15", due: null, competence: "2026-05" },
        flags: { hasSignature: false, isCancelled: false, needsReview: false }
      }
    },
    {
      input: "EXTRATO DE CONTA CORRENTE\nBanco: Bradesco S/A | Ag: 1234-5 | Conta: 12345-6\nTitular: João Silva | CPF: 123.456.789-09\nPeríodo: 01/05/2026 a 31/05/2026\nSaldo inicial: R$ 5.200,00\n02/05 PIX RECEBIDO - Empresa X R$ 1.500,00\n10/05 DÉBITO AUTOMÁTICO - Energia R$ 280,50\n15/05 TED ENVIADO - Fornecedor R$ 2.000,00\nSaldo final: R$ 4.419,50",
      output: {
        documentType: "Extrato Bancário",
        summary: "Extrato Bradesco maio/2026, saldo final R$ 4.419,50",
        keyFields: { banco: "Bradesco", agencia: "1234-5", conta: "12345-6" },
        entities: {
          emitter:   { nome: "Banco Bradesco S/A", cnpjCpf: null },
          recipient: { nome: "João Silva", cnpjCpf: "12345678909" }
        },
        financials: {
          totalValue: 4419.50, currency: "BRL",
          taxes: { icms: null, ipi: null, pis: null, cofins: null, iss: null },
          discounts: null, netValue: 4419.50
        },
        dates: { emission: null, due: null, competence: "2026-05" },
        flags: { hasSignature: false, isCancelled: false, needsReview: false }
      }
    },
    {
      input: "HOLERITE - MÊS: MAIO/2026\nFuncionário: Maria Souza | CPF: 987.654.321-00\nCargo: Analista | Depto: Financeiro\nSalário Base: R$ 4.500,00\nHoras Extras 50%: R$ 375,00\nTotal Vencimentos: R$ 4.875,00\nINSS (9%): R$ 405,00 | IRRF: R$ 230,50\nTotal Descontos: R$ 635,50\nSalário Líquido: R$ 4.239,50",
      output: {
        documentType: "Holerite",
        summary: "Holerite de Maria Souza maio/2026, líquido R$ 4.239,50",
        keyFields: { cargo: "Analista", departamento: "Financeiro", salarioBase: 4500.00 },
        entities: {
          emitter:   { nome: null, cnpjCpf: null },
          recipient: { nome: "Maria Souza", cnpjCpf: "98765432100" }
        },
        financials: {
          totalValue: 4875.00, currency: "BRL",
          taxes: { icms: null, ipi: null, pis: null, cofins: null, iss: null },
          discounts: 635.50, netValue: 4239.50
        },
        dates: { emission: null, due: null, competence: "2026-05" },
        flags: { hasSignature: false, isCancelled: false, needsReview: false }
      }
    },
    {
      input: "BOLETO BANCÁRIO\nBeneficiário: Seguradora Nacional S/A | CNPJ: 11.222.333/0001-44\nPagador: Comércio Rápido ME | CNPJ: 55.666.777/0001-88\nValor: R$ 1.250,00\nVencimento: 20/06/2026\nLinha digitável: 34191.75124 12345.678901 23456.789012 1 10000000125000\nNosso número: 00123456",
      output: {
        documentType: "Boleto",
        summary: "Boleto Seguradora Nacional, vencimento 20/06/2026, valor R$ 1.250,00",
        keyFields: { nossoNumero: "00123456", linhaDigitavel: "34191751241234567890123456789012110000000125000" },
        entities: {
          emitter:   { nome: "Seguradora Nacional S/A", cnpjCpf: "11222333000144" },
          recipient: { nome: "Comércio Rápido ME",      cnpjCpf: "55666777000188" }
        },
        financials: {
          totalValue: 1250.00, currency: "BRL",
          taxes: { icms: null, ipi: null, pis: null, cofins: null, iss: null },
          discounts: null, netValue: 1250.00
        },
        dates: { emission: null, due: "2026-06-20", competence: null },
        flags: { hasSignature: false, isCancelled: false, needsReview: false }
      }
    },
    {
      input: "BALANCETE DE VERIFICAÇÃO - MAIO/2026\nConta | Débito | Crédito | Saldo\n1.1.01 Caixa | 45.000,00 | 38.500,00 | 6.500,00 D\n1.1.02 Bancos | 120.000,00 | 95.000,00 | 25.000,00 D\n2.1.01 Fornecedores | 10.000,00 | 35.000,00 | 25.000,00 C\n3.1.01 Receita Vendas | - | 180.000,00 | 180.000,00 C\n4.1.01 CMV | 90.000,00 | - | 90.000,00 D",
      output: {
        documentType: "Balancete",
        summary: "Balancete de verificação maio/2026, receita R$ 180.000,00",
        keyFields: { totalDebitos: 265000.00, totalCreditos: 348500.00 },
        entities: { emitter: null, recipient: null },
        financials: {
          totalValue: 180000.00, currency: "BRL",
          taxes: { icms: null, ipi: null, pis: null, cofins: null, iss: null },
          discounts: null, netValue: 180000.00
        },
        dates: { emission: null, due: null, competence: "2026-05" },
        flags: { hasSignature: false, isCancelled: false, needsReview: false }
      }
    }
  ],

  // ── REGRAS DE VALIDAÇÃO EMBUTIDAS ────────────────────────────────────────
  validationRules: [
    "CNPJ deve ter 14 dígitos numéricos — validar dígitos verificadores",
    "CPF deve ter 11 dígitos numéricos — validar dígitos verificadores",
    "Chave de acesso NFe deve ter exatamente 44 dígitos",
    "Data de emissão não pode ser futura em mais de 1 dia",
    "Valor total da NF = soma dos itens - descontos + frete + outras despesas",
    "ICMS = base de cálculo × alíquota / 100",
    "PIS padrão = valor dos produtos × 0.0065",
    "COFINS padrão = valor dos produtos × 0.03",
    "Boleto vencido = data vencimento < data atual",
    "Saldo extrato = saldo inicial + créditos - débitos"
  ],

  // ── PADRÕES COMUNS ────────────────────────────────────────────────────────
  commonPatterns: {
    dateFormats:   ["dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd", "dd/mm/aa"],
    currencyFormats: ["R$ 1.234,56", "R$1234.56", "1.234,56", "1234.56"],
    documentIdentifiers: {
      NFe:        ["NOTA FISCAL ELETRÔNICA", "DANFE", "NF-e", "<NFe", "Chave de Acesso"],
      Extrato:    ["EXTRATO", "Saldo anterior", "Saldo final", "Ag:", "C/C:"],
      Boleto:     ["BOLETO", "Linha digitável", "Nosso número", "Beneficiário"],
      Holerite:   ["HOLERITE", "FOLHA DE PAGAMENTO", "Salário Líquido", "INSS", "IRRF"],
      Balancete:  ["BALANCETE", "Débito", "Crédito", "Saldo"],
      Contrato:   ["CONTRATO", "CLÁUSULA", "PARTES", "OBJETO"],
      DARF:       ["DARF", "Receita Federal", "Período de apuração", "Código da receita"]
    }
  },

  trainedAt:   "builtin",
  sampleCount: 5,
  version:     "1.0.0-builtin"
};

module.exports = { BUILTIN_KNOWLEDGE };
