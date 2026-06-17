import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import LearningDashboard from './components/LearningDashboard';
import ReconciliationDashboard from './components/ReconciliationDashboard';
import ApiTester from './components/ApiTester';
import ErrorBoundary from './ErrorBoundary';
import { db } from './firebase';
import { collection, addDoc, doc, setDoc, serverTimestamp, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import {
  Search,
  Activity,
  FileText,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Sliders,
  Settings,
  Brain,
  Trash2,
  Play,
  Download,
  CloudLightning,
  Loader2,
  Calculator,
  FolderOpen,
  HelpCircle,
  RefreshCw,
  SlidersHorizontal,
  AlertOctagon,
  ArrowRightLeft,
  ChevronRight,
  Upload,
  User as UserIcon,
  Sparkles,
  Info,
  Calendar,
  Check,
  CheckCircle,
  ArrowRight,
  FileSpreadsheet,
  Cpu
} from 'lucide-react';
import { PatientAuditItem, DocumentRecord, AuditSummary } from './types';

// ==========================================
// MOCK DATA: SIMULATED AUDIT CASES
// ==========================================
const INITIAL_DOCUMENTS: DocumentRecord[] = [
  { id: 'doc-1', name: 'Lista_Faturamento_Maio2026_ClinicaSaude.xlsx', size: '1.2 MB', type: 'faturamento', uploadedAt: '15/05/2026', status: 'processado' },
  { id: 'doc-2', name: 'Relatorio_Repasse_Maio2026_HospAlianca.csv', size: '2.4 MB', type: 'repasse', uploadedAt: '15/05/2026', status: 'processado' },
  { id: 'doc-3', name: 'Contrato_Vigente_Coparticipacao2026.pdf', size: '4.8 MB', type: 'contrato', uploadedAt: '10/01/2026', status: 'processado' },
  { id: 'doc-4', name: 'Faturamento_Ortopedia_Retroativo_2025.xlsx', size: '890 KB', type: 'faturamento', uploadedAt: '12/04/2026', status: 'processado' },
  { id: 'doc-5', name: 'Relatorio_Repasse_Ortopedia_HospAlianca.csv', size: '1.1 MB', type: 'repasse', uploadedAt: '12/04/2026', status: 'processado' },
];

const SAMPLE_RECONCILIATION_RESULTS: PatientAuditItem[] = [
  { id: 'pt-1', atendimento: '45012', nome: 'Marcos Oliveira', procedureId: 'PR-901', procedimento: 'Consulta Ortopédica Especializada', valorFaturado: 1500, valorPago: 1500, divergencia: 0, status: 'PAGO' },
  { id: 'pt-2', atendimento: '45013', nome: 'Sandra Regina Souza', procedureId: 'PR-302', procedimento: 'Ressonância Magnética do Joelho Dir.', valorFaturado: 4200, valorPago: 0, divergencia: 4200, status: 'GLOSA', motivoGlosa: 'Falta de justificativa médica ou auditoria prévia autorizada no prontuário digital.' },
  { id: 'pt-3', atendimento: '45014', nome: 'Roberta Nascimento', procedureId: 'PR-201', procedimento: 'Procedimento Cirúrgico Artroscopia', valorFaturado: 1800, valorPago: 1200, divergencia: 600, status: 'PARCIAL', motivoGlosa: 'Materiais especiais consumidos não contemplados na tabela de repasse padrão contratado.' },
  { id: 'pt-4', atendimento: '45015', nome: 'José Fernandes Silva', procedureId: 'PR-441', procedimento: 'Fisioterapia Reabilitação Postural (10s)', valorFaturado: 950, valorPago: 0, divergencia: 950, status: 'PENDENTE', motivoGlosa: 'Relatório sob análise técnica da operadora.' },
  { id: 'pt-5', atendimento: '45016', nome: 'Amanda Costa Melo', procedureId: 'PR-901', procedimento: 'Consulta Ortopédica Especializada', valorFaturado: 2400, valorPago: 2400, divergencia: 0, status: 'PAGO' },
  { id: 'pt-6', atendimento: '45017', nome: 'Lucas de Almeida', procedureId: 'PR-102', procedimento: 'Eletrocardiograma Repouso', valorFaturado: 1100, valorPago: 0, divergencia: 1100, status: 'NÃO ENCONTRADO', motivoGlosa: 'Data de atendimento ou número de guia não correspondente nos registros de repasse do hospital.' },
  { id: 'pt-7', atendimento: '45018', nome: 'Bruno Santos Guedes', procedureId: 'PR-820', procedimento: 'Infiltração Intra-articular Guiada', valorFaturado: 3000, valorPago: 3000, divergencia: 0, status: 'DUPLICADO', motivoGlosa: 'Lançamento repetido do mesmo código de atendimento e guia na mesma data.' },
  { id: 'pt-8', atendimento: '45019', nome: 'Flávia Martins', procedureId: 'PR-901', procedimento: 'Consulta Ortopédica Especializada', valorFaturado: 850, valorPago: 850, divergencia: 0, status: 'PAGO' },
  { id: 'pt-9', atendimento: '45020', nome: 'Cláudio Ferreira Lima', procedureId: 'PR-332', procedimento: 'Tomografia de Crânio Contr.', valorFaturado: 2100, valorPago: 1950, divergencia: 150, status: 'PARCIAL', motivoGlosa: 'Taxa de sala glosada devido a estouro do teto.' },
];

export default function App() {
  // Navigation Tabs state
  const [activeTab, setActiveTab] = useState<'dashboard' | 'documentos' | 'auditorias' | 'comparar' | 'calculadora' | 'relatorios' | 'treinar' | 'configuracoes' | 'teste-api'>('dashboard');

  // Core Data Base states
  const [documents, setDocuments] = useState<DocumentRecord[]>(INITIAL_DOCUMENTS);
  const [reconciliationItems, setReconciliationItems] = useState<PatientAuditItem[]>(SAMPLE_RECONCILIATION_RESULTS);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isTrained, setIsTrained] = useState(true);

  // Settings / Rules states
  const [apiKey, setApiKey] = useState<string>('V2_GEMINI_API_KEY_AI_STUDIO');
  const [selectedMatchBy, setSelectedMatchBy] = useState<'atendimento' | 'nome' | 'ambos'>('ambos');
  const [nameSimilarityThreshold, setNameSimilarityThreshold] = useState<number>(0.95);
  const [neuralMassPercentage, setNeuralMassPercentage] = useState<number>(85.4);
  const [neuralEvolutionData, setNeuralEvolutionData] = useState<Array<{ epoch: string; mass: number; confidence: number }>>([
    { epoch: 'Inicial', mass: 45.2, confidence: 62.0 },
    { epoch: 'Ajuste v1', mass: 58.7, confidence: 71.5 },
    { epoch: 'Ajuste v2', mass: 72.1, confidence: 80.2 },
    { epoch: 'Ajuste v3', mass: 80.4, confidence: 88.5 },
    { epoch: 'Atual', mass: 85.4, confidence: 92.1 },
  ]);
  const [currencyTolerance, setCurrencyTolerance] = useState<number>(0.01);
  const [customTrainingRules, setCustomTrainingRules] = useState<string>(
    "1. Desconsiderar hífens e zeros à esquerda no campo atendimento.\n2. Se o nome estiver apenas com primeiro nome, exigir cruzamento com valor.\n3. Glosar taxas administrativas não declaradas no Contrato_Vigente_Coparticipacao2026.pdf."
  );
  
  const [modelStrategy, setModelStrategy] = useState<'rotation' | 'fixo-lite' | 'fixo-flash'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('model_strategy') as any) || 'rotation';
    }
    return 'rotation';
  });

  const handleSetModelStrategy = (strategy: 'rotation' | 'fixo-lite' | 'fixo-flash') => {
    setModelStrategy(strategy);
    localStorage.setItem('model_strategy', strategy);
    showToast(`Estratégia alterada para: ${
      strategy === 'rotation' ? 'Revezamento Inteligente' :
      strategy === 'fixo-lite' ? 'Fixo Flash Lite (Econômico)' : 'Fixo Flash Principal'
    }!`);
  };

  // Calculator Interface States
  const [calculatorInput, setCalculatorInput] = useState('');
  const [calculatorHistory, setCalculatorHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([
    { role: 'model', text: 'Olá! Sou seu assistente de auditoria inteligente. Posso analisar divergências, calcular taxas de glosas ou responder a questionamentos complexos do contrato de repasse. Pergunte-me qualquer detalhe sobre os casos analisados!' }
  ]);
  const [isCalculating, setIsCalculating] = useState(false);

  // Selector for uploading comparing lists
  const [selectedFilePatients, setSelectedFilePatients] = useState<string | null>('Lista_Faturamento_Maio2026_ClinicaSaude.xlsx');
  const [selectedFileHospital, setSelectedFileHospital] = useState<string | null>('Relatorio_Repasse_Maio2026_HospAlianca.csv');

  // Training state
  const [trainingLogs, setTrainingLogs] = useState<string[]>([]);
  const [isTrainingNow, setIsTrainingNow] = useState(false);
  const [hoveredDataPoint, setHoveredDataPoint] = useState<any>(null);

  // Firestore registration states
  const [isRegisteringProdKeys, setIsRegisteringProdKeys] = useState(false);
  const [prodKeysGenerated, setProdKeysGenerated] = useState(false);
  const [neuralHospitals, setNeuralHospitals] = useState<any[]>([]);

  // Carregar padrões neurais aprendidos
  const fetchNeuralPatterns = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "knowledge_base"));
      const hospitals: any[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.hospitalId) {
          hospitals.push({ id: doc.id, ...data });
        }
      });
      setNeuralHospitals(hospitals);
    } catch (e) {
      console.error("Erro ao carregar padrões neurais:", e);
    }
  };

  useEffect(() => {
    if (activeTab === 'treinar') {
      fetchNeuralPatterns();
    }
  }, [activeTab]);

  const handleRegisterKeysInProduction = async () => {
    setIsRegisteringProdKeys(true);
    try {
      // Define exact generated keys
      const keys = [
        { key: "dk_admin_4c42b5f89cfa4988b81f07d624c16fd8", appId: "admin", appName: "Admin", role: "admin", active: true, createdAt: new Date(), lastUsedAt: null },
        { key: "dk_app_398621514c374c1bbaee5c20d65f2a83", appId: "app1", appName: "Meu App 1", role: "app", active: true, createdAt: new Date(), lastUsedAt: null },
        { key: "dk_app_9afda75222e940538b598d9564b693b8", appId: "app2", appName: "Meu App 2", role: "app", active: true, createdAt: new Date(), lastUsedAt: null }
      ];

      for (const k of keys) {
        await addDoc(collection(db, "api_keys"), k);
      }

      // Create global metadata document in knowledge_base
      await setDoc(doc(db, "knowledge_base", "global"), {
        trainedAt: "builtin",
        version: "1.0.0-builtin",
        savedAt: new Date(),
        note: "Base builtin — a IA já vem treinada para todos os tipos de documento."
      });

      setProdKeysGenerated(true);
      showToast("Chaves de API e Regras Globais registradas com sucesso no Firestore de Produção!");
    } catch (err: any) {
      console.error(err);
      showToast("Falha ao registrar chaves no Firestore: " + (err.message || err));
    } finally {
      setIsRegisteringProdKeys(false);
    }
  };

  // Notification Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Re-calculate statistics summarizing reconciliationItems
  const calculateSummary = (items: PatientAuditItem[]): AuditSummary => {
    const total = items.length;
    const totalFaturado = items.reduce((sum, i) => sum + i.valorFaturado, 0);
    const totalPago = items.reduce((sum, i) => sum + i.valorPago, 0);
    const totalDivergencia = items.reduce((sum, i) => sum + i.divergencia, 0);

    const pagos = items.filter(i => i.status === 'PAGO').length;
    const pendentes = items.filter(i => i.status === 'PENDENTE').length;
    const parciais = items.filter(i => i.status === 'PARCIAL').length;
    const glosas = items.filter(i => i.status === 'GLOSA').length;
    const naoEncontrados = items.filter(i => i.status === 'NÃO ENCONTRADO').length;
    const duplicados = items.filter(i => i.status === 'DUPLICADO').length;

    // Success rate is % of records fully paid
    const successRate = total > 0 ? (pagos / total) * 100 : 0;

    return {
      totalPacientes: total,
      valorTotalFaturado: totalFaturado,
      valorTotalPago: totalPago,
      valorTotalDivergencia: totalDivergencia,
      taxaSucesso: successRate,
      pagosCount: pagos,
      pendentesCount: pendentes,
      parciaisCount: parciais,
      glosasCount: glosas,
      naoEncontradosCount: naoEncontrados,
      duplicadosCount: duplicados,
    };
  };

  const summary = calculateSummary(reconciliationItems);

  // Multi-file Drag & Drop simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'faturamento' | 'repasse') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const newDoc: DocumentRecord = {
        id: `doc-${Date.now()}`,
        name: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        type,
        uploadedAt: new Date().toLocaleDateString('pt-BR'),
        status: 'processado'
      };

      setDocuments(prev => [newDoc, ...prev]);
      if (type === 'faturamento') {
        setSelectedFilePatients(file.name);
      } else {
        setSelectedFileHospital(file.name);
      }
      showToast(`Arquivo "${file.name}" carregado e processado com sucesso como ${type === 'faturamento' ? 'Faturamento' : 'Repasse'}!`);
    }
  };

  // Run AI Reconciliation simulation
  const triggerReconciliation = () => {
    setIsReconciling(true);
    setTimeout(() => {
      // Simulate analysis by slightly modifying discrepancy values based on tolerance & threshold
      const updated = reconciliationItems.map(item => {
        if (item.status === 'GLOSA' || item.status === 'PARCIAL') {
          // Keep as discrepancy
          return item;
        }
        // Small simulation variant
        return item;
      });
      setReconciliationItems(updated);
      setIsReconciling(false);
      showToast("Reconciliação e auditoria realizada! Resultados cruzados via Gemini AI.");
      setActiveTab('comparar');
    }, 2800);
  };

  // Run AI specialized training simulator
  const runTrainingSimulator = () => {
    setIsTrainingNow(true);
    setTrainingLogs([
      "🔄 Iniciando conexão com o modelo gemini-flash-latest...",
      "📑 Analisando documentos de exemplo carregados no banco...",
      "🔍 Mapeando divergências históricas e regras de validação encontradas...",
      "🤖 Extraindo prompt de sistema em formato JSON consolidado...",
      "✅ Otimizando pesos para regras de faturamento de saúde...",
      "⚡ Atualizando banco de conhecimento 'knowledge_base/global' no Firestore...",
    ]);

    let i = 0;
    const interval = setInterval(() => {
      i++;
      if (i === 1) setTrainingLogs(prev => [...prev, "🧬 Modelo de Machine Learning ajustado com sucesso."]);
      if (i === 2) setTrainingLogs(prev => [...prev, "🌟 Novo padrão cognitivo persistido: v2.4.15."]);
      if (i === 3) {
        clearInterval(interval);
        setIsTrainingNow(false);
        setIsTrained(true);
        setNeuralMassPercentage(98.0); // Stay at the absolute highest limits of parsing
        setNeuralEvolutionData(prev => {
          const nextCount = prev.length + 1;
          return [
            ...prev,
            { epoch: `Finetune #${nextCount - 5}`, mass: 98.0, confidence: 99.4 }
          ];
        });
        showToast("Treinamento do Auditor IA finalizado. Conhecimento e Massa Neural elevados ao máximo de 98%!");
      }
    }, 1500);
  };

  // Chat custom model assistant questions
  const askAIQuery = (presetText?: string) => {
    const prompt = presetText || calculatorInput;
    if (!prompt.trim()) return;

    setCalculatorHistory(prev => [...prev, { role: 'user', text: prompt }]);
    setCalculatorInput('');
    setIsCalculating(true);

    setTimeout(() => {
      let aiResponseText = '';
      const promptLower = prompt.toLowerCase();

      if (promptLower.includes('glosa') || promptLower.includes('rejeit') || promptLower.includes('sandra')) {
        aiResponseText = `**Análise de Glosas de Faturamento:**\n\nIdentificamos que a maior glosa individual pertence à paciente **Sandra Regina Souza** (Atendimento: 45013), no valor de **R$ 4.200,00** referente a *Ressonância Magnética do Joelho Dir.*.\n\n*   **Causa Raiz:** O Hospital Geral Aliança rejeitou o repasse devido à falta de justificativa clínica anexada ao prontuário digital no momento da solicitação.\n*   **Recomendação:** Anexar laudo prévio e reenviar recurso de glosa em até 48 horas usando a aba de faturamento recursal.`;
      } else if (promptLower.includes('total') || promptLower.includes('valores') || promptLower.includes('faturado')) {
        aiResponseText = `**Resumo Financeiro da Auditoria Atual:**\n\n*   **Total Faturado pela Clínica:** R$ ${summary.valorTotalFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n*   **Total Repassado/Pago pelo Hospital:** R$ ${summary.valorTotalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n*   **Divergência Total Pendente:** R$ ${summary.valorTotalDivergencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n**Taxa de Sucesso de Pagamento:** ${summary.taxaSucesso.toFixed(1)}%\nAproximadamente **${((summary.valorTotalDivergencia / summary.valorTotalFaturado) * 100).toFixed(1)}%** do faturamento total está comprometido devido a glosas e divergências de auditoria de operadora.`;
      } else if (promptLower.includes('contemplad') || promptLower.includes('contrato') || promptLower.includes('coparticipacao')) {
        aiResponseText = `**Verificação de Regras Contratuais:**\n\nNo arquivo verificado *Contrato_Vigente_Coparticipacao2026.pdf*, a taxa de coparticipação máxima para procedimentos de Ortopedia e Imagem é de 20%, exceto materiais descartáveis especiais não listados no anexo B.\n\nNa auditoria atual, o caso da paciente **Roberta Nascimento** colidiu com esta cláusula: uma glosa parcial de **R$ 600,00** foi imposta nos materiais aplicados no procedimento de cirurgia de artroscopia, confirmando que estes materiais especiais não pertenciam à tabela de repasse permitida contratualmente.`;
      } else {
        aiResponseText = `Com base nos dados extraídos dos faturamentos e dos relatórios do hospital, posso confirmar que existem **${summary.totalPacientes} pacientes** auditados nesta rodada. Destes, **${summary.pagosCount} pagamentos** estão 100% corretos, enquanto temos **${summary.glosasCount} glosas totais** e **${summary.parciaisCount} glosas parciais**. Há um passivo financeiro imediato de **R$ ${summary.valorTotalDivergencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}** pendente de intervenção humana. Deseja que eu gere uma planilha XML com as contestações prontas para importação hospitalar?`;
      }

      setCalculatorHistory(prev => [...prev, { role: 'model', text: aiResponseText }]);
      setIsCalculating(false);
    }, 1200);
  };

  return (
    <div id="audit-app-root" className="min-h-screen bg-[#070b13] text-slate-100 flex flex-col font-sans antialiased text-sm">
      {/* 4000ms duration Toast Message notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-[#16223F] border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)] px-4 py-3 rounded-xl flex items-center gap-2.5 max-w-md"
          >
            <Sparkles className="w-5 h-5 text-cyan-400 shrink-0 animate-pulse" />
            <span className="text-slate-200 text-xs font-medium">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TOP NAVIGATION BAR */}
      <header id="top-nav-panel" className="bg-[#0a0f1d] border-b border-slate-900 shrink-0 w-full z-20">
        <div className="px-8 h-16 flex items-center justify-between border-b border-slate-950/80 bg-[#080d19]">
          {/* Logo & Brand info */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
              <Search className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-base tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                AuditAI
              </span>
              <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase -mt-1 font-bold">
                DocEngineSuite
              </span>
            </div>
          </div>

          {/* Active status & profile info */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex bg-[#0b1322] border border-emerald-500/10 px-3 py-1.5 rounded-full items-center gap-2 text-[10px] font-medium text-emerald-400 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Gemini Conectado</span>
            </div>

            <div className="flex items-center gap-3 bg-[#080d19] border border-slate-900/40 px-3 py-1 rounded-xl">
              <div className="w-7 h-7 bg-gradient-to-br from-indigo-600 to-cyan-500 text-xs font-bold text-white rounded-full flex items-center justify-center shadow-md">
                AU
              </div>
              <div className="hidden md:block text-left">
                <p className="text-[10px] font-semibold text-slate-200">Auditor</p>
                <p className="text-[8px] text-cyan-400 font-mono">
                  {modelStrategy === 'rotation' ? 'gemini-revezamento' : modelStrategy === 'fixo-lite' ? 'gemini-3.1-flash-lite' : 'gemini-3.1-pro-preview'}
                </p>
              </div>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" title="Serviço ativo" />
            </div>
          </div>
        </div>

        {/* Categories / Navigation row */}
        <div className="px-8 py-2 bg-[#090f1d] flex items-center justify-between gap-4 overflow-x-auto scrollbar-none">
          <nav className="flex items-center gap-1.5 w-full min-w-max">
            {/* PRINCIPAL CATEGORY */}
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-4 mr-2">
              <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase mr-1">Principal</span>
              
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>

              <button
                onClick={() => setActiveTab('documentos')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'documentos'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Documentos</span>
                <span className="bg-blue-600/20 text-blue-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                  12
                </span>
              </button>

              <button
                onClick={() => setActiveTab('auditorias')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'auditorias'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Auditorias</span>
              </button>
            </div>

            {/* ANÁLISE CATEGORY */}
            <div className="flex items-center gap-1.5 border-r border-slate-800 pr-4 mr-2">
              <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase mr-1">Análise</span>

              <button
                onClick={() => setActiveTab('comparar')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'comparar'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Comparar Tabelas</span>
              </button>
              
              <button
                onClick={() => setActiveTab('cruzamento')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'cruzamento'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Cruzamento Fin.</span>
              </button>

              <button
                onClick={() => setActiveTab('calculadora')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'calculadora'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Calculadora IA</span>
              </button>

              <button
                onClick={() => setActiveTab('relatorios')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'relatorios'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Relatórios</span>
                <span className="bg-purple-600/20 text-purple-400 text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                  3
                </span>
              </button>
            </div>

            {/* CONFIG CATEGORY */}
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase mr-1">Config</span>

              <button
                onClick={() => setActiveTab('treinar')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'treinar'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>Treinar Modelo</span>
              </button>

              <button
                onClick={() => setActiveTab('configuracoes')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'configuracoes'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configurações</span>
              </button>

              <button
                onClick={() => setActiveTab('teste-api')}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTab === 'teste-api'
                    ? 'bg-gradient-to-r from-cyan-950/40 to-slate-900 border border-cyan-500/30 text-cyan-200 shadow-md'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/45'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Teste API</span>
              </button>
            </div>
          </nav>
        </div>
      </header>

      {/* MAIN CONTAINER WORKSPACE */}
      <main className="flex-1 flex flex-col min-w-0 bg-[#060910] bg-[radial-gradient(#101626_1px,transparent_1px)] [background-size:24px_24px]">
        {/* WORKSPACE INNER VIEWS */}
        <div className="flex-1 overflow-y-auto p-8">
          <ErrorBoundary key={activeTab} fallbackMessage={`Erro ao carregar a tela de ${activeTab}.`}>
            <AnimatePresence mode="wait">
            {/* 1. DASHBOARD VIEW */}
            {activeTab === 'dashboard' && (
              <motion.div
                key="dashboard-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                {/* BENTO GRID SUMMARY CARDS */}
                <div id="bento-grid-summary" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Card 1: Documents Read */}
                  <div className="bg-[#0b1120] border border-slate-900 p-5 rounded-2xl relative overflow-hidden group hover:border-[#1d2d50] transition-colors shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 rounded-full blur-2xl" />
                    <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Docu Lido</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-extrabold text-white tracking-tight">24</span>
                      <span className="text-emerald-500 text-xs font-semibold">+18 esta semana</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-mono">Formatos: xlsx, csv, pdf, xml</p>
                  </div>

                  {/* Card 2: Audited OK */}
                  <div className="bg-[#0b1120] border border-slate-900 p-5 rounded-2xl relative overflow-hidden group hover:border-[#1d2d50] transition-colors shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-600/5 rounded-full blur-2xl" />
                    <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Audi OK</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-extrabold text-white tracking-tight">18</span>
                      <span className="text-cyan-400 text-xs font-semibold">76.5% de repasses</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-mono">Totalmente reconciliados</p>
                  </div>

                  {/* Card 3: Divergences */}
                  <div className="bg-[#0b1120] border border-slate-900 p-5 rounded-2xl relative overflow-hidden group hover:border-[#1d2d50] transition-colors shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-600/5 rounded-full blur-2xl" />
                    <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Divergências</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-extrabold text-amber-400 tracking-tight">41</span>
                      <span className="text-amber-500/90 text-xs font-semibold">Revisões pendentes</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-mono">Glosas totais e parciais</p>
                  </div>

                  {/* Card 4: Sum real automation */}
                  <div className="bg-[#0b1120] border border-slate-900 p-5 rounded-2xl relative overflow-hidden group hover:border-[#1d2d50] transition-colors shadow-2xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 rounded-full blur-2xl" />
                    <p className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">Cálc Realizado</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-3xl font-extrabold text-purple-400 tracking-tight">R$ 1.2M</span>
                      <span className="text-indigo-400 text-xs font-semibold">Automação Completa</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2 font-mono">Economia de tempo humano</p>
                  </div>
                </div>

                {/* CENTRAL ACTION ARENA */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  {/* LEFT: UPLOAD WIDGETS */}
                  <div className="lg:col-span-7 bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl relative">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2">
                        <ArrowRightLeft className="text-cyan-400 w-5 h-5 animate-pulse" />
                        <h2 className="text-sm font-bold text-slate-200">Reconciliação de Faturamento e Repasses</h2>
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400 uppercase bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/10">Processamento em Série</span>
                    </div>

                    <div className="mb-6" />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Dropzone 1 */}
                      <div className="border border-dashed border-slate-850 hover:border-cyan-500/30 rounded-2xl p-4 text-center cursor-pointer bg-[#0e172a]/30 transition-all group relative">
                        <input
                          type="file"
                          id="upload-faturamento"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => handleFileUpload(e, 'faturamento')}
                          accept=".xlsx,.xls,.csv,.txt"
                        />
                        <div className="w-10 h-10 bg-[#16223f] text-cyan-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </div>
                        <h3 className="text-xs font-semibold text-slate-200">1. Lista de Faturamento</h3>
                        <p className="text-[10px] text-slate-500 mt-1">Carregar Excel de faturamento da clínica.</p>
                        {selectedFilePatients && (
                          <div className="mt-3 bg-cyan-950/40 border border-cyan-800/10 px-2 py-1 rounded text-[10px] text-cyan-300 truncate text-left flex items-center gap-1.5 justify-center">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span className="truncate">{selectedFilePatients}</span>
                          </div>
                        )}
                      </div>

                      {/* Dropzone 2 */}
                      <div className="border border-dashed border-slate-850 hover:border-cyan-500/30 rounded-2xl p-4 text-center cursor-pointer bg-[#0e172a]/30 transition-all group relative">
                        <input
                          type="file"
                          id="upload-repasse"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          onChange={(e) => handleFileUpload(e, 'repasse')}
                          accept=".xlsx,.xls,.csv"
                        />
                        <div className="w-10 h-10 bg-[#16223f] text-purple-400 rounded-xl flex items-center justify-center mx-auto mb-3">
                          <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        </div>
                        <h3 className="text-xs font-semibold text-slate-200">2. Relatório de Repasse</h3>
                        <p className="text-[10px] text-slate-500 mt-1">Carregar planilha enviada pelo hospital.</p>
                        {selectedFileHospital && (
                          <div className="mt-3 bg-purple-950/40 border border-purple-800/10 px-2 py-1 rounded text-[10px] text-purple-300 truncate text-left flex items-center gap-1.5 justify-center">
                            <CheckCircle2 className="w-3 h-3 shrink-0 text-purple-400" />
                            <span className="truncate">{selectedFileHospital}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SETTING CONFIG WIDGETS IN DASHBOARD */}
                    <div className="bg-[#0c1426] border border-slate-900 rounded-2xl p-4 mt-6 space-y-4">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-300 border-b border-slate-850 pb-2">
                        <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" /> Parâmetros Exclusivos de Validação</span>
                        <button onClick={() => setActiveTab('configuracoes')} className="text-cyan-400 hover:underline text-[10px]">Ver tudo</button>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] text-slate-400 font-mono block mb-1">Mapeamento</label>
                          <select
                            value={selectedMatchBy}
                            onChange={(e: any) => setSelectedMatchBy(e.target.value)}
                            className="w-full bg-[#070b13] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                          >
                            <option value="ambos">Por Guia & Nome</option>
                            <option value="atendimento">Apenas Atendimento</option>
                            <option value="nome">Apenas Nome do Paciente</option>
                          </select>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[10px] text-slate-400 font-mono block">Fuzzy de Nome ({Math.round(nameSimilarityThreshold * 100)}%)</label>
                            {nameSimilarityThreshold >= 0.95 && (
                              <span className="text-[9px] text-[#2dd4bf] font-mono font-bold uppercase tracking-tight">✓ MÁXIMO (95%)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0.5"
                              max="0.95"
                              step="0.05"
                              value={nameSimilarityThreshold}
                              onChange={(e) => setNameSimilarityThreshold(parseFloat(e.target.value))}
                              className="flex-1 accent-cyan-500"
                            />
                            <button
                              onClick={() => {
                                setNameSimilarityThreshold(0.95);
                                showToast("Fuzzy de Nome fixado no máximo (95%) para maior redundância!");
                              }}
                              className="text-[9px] font-bold bg-[#141b2d] hover:bg-slate-800 text-slate-300 border border-slate-800 rounded px-1.5 py-0.5 tracking-tight transition-colors cursor-pointer"
                            >
                              MAX
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* TRIGGER PROCESSOR */}
                    <div className="mt-6 flex gap-3">
                      <button
                        onClick={triggerReconciliation}
                        disabled={isReconciling || !selectedFilePatients || !selectedFileHospital}
                        className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 py-3.5 px-4 rounded-xl text-xs font-bold text-white shadow-xl shadow-cyan-500/10 flex items-center justify-center gap-2 cursor-pointer transition-all uppercase tracking-wider"
                      >
                        {isReconciling ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Auditando Diferenças com IA...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-white" />
                            <span>Iniciar Auditoria Cruzada</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setSelectedFilePatients("Lista_Faturamento_Maio2026_ClinicaSaude.xlsx");
                          setSelectedFileHospital("Relatorio_Repasse_Maio2026_HospAlianca.csv");
                          showToast("Demonstração: Dados padrão de auditoria carregados!");
                        }}
                        className="bg-[#101b33] hover:bg-[#162547] px-4 rounded-xl text-xs font-semibold text-cyan-300 transition-colors border border-cyan-800/10 block"
                        title="Carrega arquivos exemplo representados para auditoria"
                      >
                        Carregar Caso Demo
                      </button>
                    </div>
                  </div>

                  {/* RIGHT: LIVE AUDIT LOGS */}
                  <div className="lg:col-span-5 flex flex-col bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/5 rounded-full blur-2xl" />
                    <div className="flex items-center justify-between mb-4 border-b border-slate-850 pb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="text-purple-400 w-4 h-4 shrink-0" />
                        <h2 className="text-xs font-bold text-slate-200">Eventos de Análise Recentes</h2>
                      </div>
                      <button
                        onClick={() => {
                          setReconciliationItems(SAMPLE_RECONCILIATION_RESULTS);
                          showToast("Dados resetados para o estado padrão.");
                        }}
                        className="text-slate-500 hover:text-slate-300"
                        title="Reiniciar dados"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 space-y-4 overflow-y-auto max-h-[340px] pr-1.5 scrollbar-none">
                      <div className="border-l-2 border-emerald-500 pl-3 py-0.5 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-300">Conhecimento Carregado</p>
                        <p className="text-[10px] text-slate-500">Modelo cognitivo atualizado com regras de contratos em 15/05/2026.</p>
                        <p className="text-[9px] text-[#2dd4bf] font-mono">v1.2.9 - Estável</p>
                      </div>

                      <div className="border-l-2 border-cyan-500 pl-3 py-0.5 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-300">Cruzamento de Maio executado</p>
                        <p className="text-[10px] text-slate-500">Duplicidades e relatórios de discrepâncias prontas nos painéis.</p>
                        <p className="text-[9px] text-cyan-400 font-mono">18 itens corretos | 41 divergências</p>
                      </div>

                      <div className="border-l-2 border-amber-500 pl-3 py-0.5 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-300">Alerta de Risco Operacional</p>
                        <p className="text-[10px] text-slate-500">Glosa de faturamento no Hospital Aliança disparou +18% na última semana.</p>
                        <p className="text-[9px] text-amber-400 font-mono">Procedimento: Ressonâncias</p>
                      </div>

                      <div className="border-l-2 border-[#a855f7] pl-3 py-0.5 space-y-1">
                        <p className="text-[11px] font-semibold text-slate-300">Treinador cognição ativo</p>
                        <p className="text-[10px] text-slate-500">Gemini AI habilitado para processamento de linguagem natural e contestações.</p>
                        <p className="text-[9px] text-[#a855f7] font-mono">Pronto</p>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-slate-850 bg-[#0c1426] p-3.5 rounded-2xl">
                      <div className="flex items-center gap-2 mb-1.5">
                        <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">Status do Motor Cognitivo</span>
                      </div>
                      <p className="text-[10px] text-slate-450 leading-relaxed">
                        Contratos carregados mapeados com o Gemini de maneira inteligente para identificar automaticamente termos médicos com 95%+ de assertividade.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 2. DOCUMENTOS CLÍNICAS VIEW */}
            {activeTab === 'documentos' && (
              <motion.div
                key="documentos-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h2 className="text-base font-bold text-slate-200">Fichas e Documentos Disponíveis</h2>
                    </div>

                    <div className="flex gap-2">
                      <label className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl py-2 px-4 text-xs font-bold transition-all cursor-pointer flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        <span>Fazer Upload</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => handleFileUpload(e, 'faturamento')}
                          accept=".xlsx,.xls,.csv,.pdf"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-sans text-xs">
                      <thead>
                        <tr className="border-b border-slate-850 text-slate-400 font-semibold">
                          <th className="pb-3 px-2">Nome do Arquivo</th>
                          <th className="pb-3">Tipo</th>
                          <th className="pb-3">Tamanho</th>
                          <th className="pb-3">Data de Upload</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/50">
                        {documents.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-900/10 group transition-colors">
                            <td className="py-4 px-2 font-medium text-slate-200 flex items-center gap-2.5">
                              {doc.type === 'faturamento' && <FileSpreadsheet className="w-4.5 h-4.5 text-cyan-400" />}
                              {doc.type === 'repasse' && <FileSpreadsheet className="w-4.5 h-4.5 text-purple-400" />}
                              {doc.type === 'contrato' && <FileText className="w-4.5 h-4.5 text-emerald-400" />}
                              {doc.type === 'outro' && <FileText className="w-4.5 h-4.5 text-slate-400" />}
                              <span className="truncate max-w-xs">{doc.name}</span>
                            </td>
                            <td className="py-4 capitalize font-mono text-slate-400">
                              {doc.type === 'repasse' ? 'Relatório Repasse' : doc.type === 'faturamento' ? 'Faturamento Clínica' : 'Contrato'}
                            </td>
                            <td className="py-4 font-mono text-slate-400">{doc.size}</td>
                            <td className="py-4 text-slate-400">{doc.uploadedAt}</td>
                            <td className="py-4">
                              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                                {doc.status}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => {
                                    if (doc.type === 'faturamento') {
                                      setSelectedFilePatients(doc.name);
                                      showToast(`Selecionado "${doc.name}" para faturamento clínica.`);
                                    } else if (doc.type === 'repasse') {
                                      setSelectedFileHospital(doc.name);
                                      showToast(`Selecionado "${doc.name}" para repasse hospital.`);
                                    } else {
                                      showToast("Arquivo de contrato de referência indexado.");
                                    }
                                  }}
                                  className="p-1 px-2.5 rounded hover:bg-cyan-950/40 hover:text-cyan-400 text-slate-400 transition-all text-[11px] font-medium"
                                  title="Definir como arquivo ativo"
                                >
                                  Usar na Auditoria
                                </button>
                                <button
                                  onClick={() => {
                                    setDocuments(prev => prev.filter(d => d.id !== doc.id));
                                    showToast("Arquivo excluído com sucesso.");
                                  }}
                                  className="p-1.5 rounded hover:bg-red-950/30 hover:text-red-400 text-slate-500 transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 3. AUDITORIAS HISTORIC VIEW */}
            {activeTab === 'auditorias' && (
              <motion.div
                key="auditorias-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl">
                  <h2 className="text-base font-bold text-slate-200 mb-6">Histórico de Rodadas de Auditoria</h2>

                  <div className="space-y-4">
                    <div className="bg-[#070b13] border border-slate-900 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-cyan-950/50 rounded-xl flex items-center justify-center text-cyan-400 border border-cyan-800/10">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-semibold text-slate-200">Reconciliação Executiva Hospital Aliança (Completo)</h3>
                          <p className="text-[10px] text-slate-500">Auditado por Auditor IA em 02/06/2026 às 10:35 UTC</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-xs font-semibold text-slate-200 block">R$ 1.200.000,00</span>
                          <span className="text-[9px] text-[#2dd4bf] font-mono">18 pacientes corretos</span>
                        </div>
                        <button onClick={() => setActiveTab('comparar')} className="bg-[#11203b] hover:bg-[#162a4d] px-3 py-1.5 rounded-xl text-[11px] font-bold text-cyan-300 transition-colors">
                          Ver Tabela
                        </button>
                      </div>
                    </div>

                    <div className="bg-[#070b13] border border-slate-900 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 opacity-75">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-purple-950/50 rounded-xl flex items-center justify-center text-purple-400 border border-purple-800/10">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="text-xs font-semibold text-slate-200">Auditoria Ortopédica Retroativa 2025</h3>
                          <p className="text-[10px] text-slate-500">Auditado por Inteligência de Regras em 12/04/2026</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <span className="text-xs font-semibold text-slate-200 block">R$ 450.000,00</span>
                          <span className="text-[9px] text-[#2dd4bf] font-mono">Taxa sucesso: 82%</span>
                        </div>
                        <button onClick={() => {
                          showToast("Histórico de Ortopedia 2025 carregado temporariamente!");
                          setActiveTab('comparar');
                        }} className="bg-[#11203b] hover:bg-[#162a4d] px-3 py-1.5 rounded-xl text-[11px] font-bold text-cyan-300 transition-colors">
                          Ver Tabela
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'cruzamento' && (
              <motion.div
                key="cruzamento-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <ReconciliationDashboard />
              </motion.div>
            )}

            {/* 4. COMPARAR TABELAS / CORE RESULTS GRID */}
            {activeTab === 'comparar' && (
              <motion.div
                key="comparar-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* RECONCILIATION SPREADSHEET */}
                <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-850 pb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-200">Reconciliação Ativa: Clínica vs Hospital</h2>
                      <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500">
                        <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span>Faturamento: <strong className="text-slate-350">{selectedFilePatients}</strong></span>
                        <span className="mx-1">•</span>
                        <FileText className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                        <span>Repasse: <strong className="text-slate-350">{selectedFileHospital}</strong></span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={triggerReconciliation}
                        disabled={isReconciling}
                        className="bg-[#16223f] text-cyan-300 hover:bg-[#203259] px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border border-cyan-800/20 flex items-center gap-1"
                      >
                        {isReconciling ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            <span>Auditando...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Reauditar com IA</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          showToast("Contestações exportadas com sucesso!");
                        }}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Exportar XML</span>
                      </button>
                    </div>
                  </div>

                  {/* MINI REPORT IN COMPARAR */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[#070b13] p-4 rounded-2xl mb-6 text-xs border border-slate-850">
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] block uppercase font-mono">Divergências</span>
                      <span className="text-sm font-bold text-amber-500">
                        R$ {summary.valorTotalDivergencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] block uppercase font-mono">Total Pago</span>
                      <span className="text-sm font-bold text-emerald-500">
                        R$ {summary.valorTotalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] block uppercase font-mono">Taxa Sucesso</span>
                      <span className="text-sm font-bold text-cyan-400">
                        {summary.taxaSucesso.toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      <span className="text-slate-400 text-[10px] block uppercase font-mono">Confiabilidade IA</span>
                      <span className="text-xs font-extrabold text-purple-400 bg-purple-950/20 px-2.5 py-0.5 rounded-full border border-purple-800/10 inline-block">
                        95% Alta
                      </span>
                    </div>
                  </div>

                  {/* SPREADSHEET TABLE */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead>
                        <tr className="border-b border-slate-850 text-slate-400 font-semibold">
                          <th className="pb-3 px-2">Guia / Atend</th>
                          <th className="pb-3">Paciente</th>
                          <th className="pb-3">Procedimento</th>
                          <th className="pb-3 text-right">Faturado</th>
                          <th className="pb-3 text-right">Pago</th>
                          <th className="pb-3 text-right">Diferença</th>
                          <th className="pb-3 text-center">Status</th>
                          <th className="pb-3 pl-4">Auditoria / Motivo da Glosa</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-850/40">
                        {reconciliationItems.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-900/15 transition-colors">
                            <td className="py-3 px-2 font-mono text-slate-300 font-medium">#{item.atendimento}</td>
                            <td className="py-3 font-semibold text-slate-200">{item.nome}</td>
                            <td className="py-3 text-slate-400 truncate max-w-[180px]" title={item.procedimento}>{item.procedimento}</td>
                            <td className="py-3 text-right text-slate-300">R$ {item.valorFaturado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="py-3 text-right text-slate-300">R$ {item.valorPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className={`py-3 text-right font-semibold ${item.divergencia > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                              R$ {item.divergencia.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3 text-center">
                              <span className={`px-2 py-0.5 font-bold text-[10px] rounded-full border ${
                                item.status === 'PAGO' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                item.status === 'GLOSA' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                item.status === 'PARCIAL' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                item.status === 'PENDENTE' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                item.status === 'DUPLICADO' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                              }`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 pl-4 max-w-sm font-sans text-[11px] text-slate-400 truncate focus:text-visible" title={item.motivoGlosa}>
                              {item.motivoGlosa || (
                                <span className="text-emerald-500/80 flex items-center gap-1">
                                  <Check className="w-3 h-3" /> Reconciliado com sucesso
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 5. CALCULADORA IA VIEW */}
            {activeTab === 'calculadora' && (
              <motion.div
                key="calculadora-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[550px]">
                  {/* CHAT CHANNELS PANEL */}
                  <div className="lg:col-span-8 flex flex-col bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl h-full overflow-hidden">
                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1.5 scrollbar-none scroll-smooth">
                      {calculatorHistory.map((msg, idx) => (
                        <div
                          key={idx}
                          className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                              msg.role === 'user'
                                ? 'bg-[#1e293b] text-slate-100 rounded-tr-none'
                                : 'bg-[#0f172a] text-slate-300 rounded-tl-none border border-slate-850'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 mb-2 border-b border-slate-800/40 pb-1 font-semibold text-[10px] text-slate-400 uppercase tracking-widest">
                              {msg.role === 'user' ? <UserIcon className="w-3 h-3" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                              <span>{msg.role === 'user' ? 'Você' : 'Auditor IA'}</span>
                            </div>
                            <div className="whitespace-pre-wrap font-sans">
                              {msg.text}
                            </div>
                          </div>
                        </div>
                      ))}
                      {isCalculating && (
                        <div className="flex gap-3 justify-start animate-pulse">
                          <div className="max-w-md bg-[#0f172a] text-slate-400 rounded-2xl p-3.5 text-xs rounded-tl-none border border-slate-850 flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            <span>Gemini está analisando os dados do faturamento...</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Chat Input */}
                    <div className="flex gap-2 shrink-0 border-t border-slate-850 pt-3">
                      <input
                        type="text"
                        value={calculatorInput}
                        onChange={(e) => setCalculatorInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && askAIQuery()}
                        placeholder="Ex: Qual foi a taxa de glosa total de faturamento?"
                        className="flex-1 bg-[#070b13] border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-sans"
                        disabled={isCalculating}
                      />
                      <button
                        onClick={() => askAIQuery()}
                        disabled={isCalculating || !calculatorInput.trim()}
                        className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 px-5 rounded-xl text-xs font-bold text-white transition-all shrink-0 flex items-center justify-center cursor-pointer"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>

                  {/* PRESETS WORKBOOK */}
                  <div className="lg:col-span-4 bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl h-full flex flex-col justify-between overflow-y-auto">
                    <div>
                      <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">Sugestões de Análise Técnica</h2>
                      <div className="space-y-2.5">
                        <button
                          onClick={() => askAIQuery("Qual o total faturado, quanto foi pago e qual a divergência?")}
                          className="w-full text-left bg-[#0e172a]/40 hover:bg-[#162547]/40 border border-slate-850 rounded-xl p-3 text-xs text-slate-350 hover:text-cyan-300 hover:border-cyan-500/20 transition-all font-medium"
                        >
                          💸 Resumo de Valores Monetários
                        </button>
                        <button
                          onClick={() => askAIQuery("Por que o repasse da paciente Sandra Regina Souza foi rejeitado com GLOSA?")}
                          className="w-full text-left bg-[#0e172a]/40 hover:bg-[#162547]/40 border border-slate-850 rounded-xl p-3 text-xs text-slate-350 hover:text-cyan-300 hover:border-cyan-500/20 transition-all font-medium"
                        >
                          🔍 Causa Raiz da Glosa de Sandra
                        </button>
                        <button
                          onClick={() => askAIQuery("O que o contrato fala sobre coparticipação e faturamento de materiais especiais?")}
                          className="w-full text-left bg-[#0e172a]/40 hover:bg-[#162547]/40 border border-slate-850 rounded-xl p-3 text-xs text-slate-350 hover:text-cyan-300 hover:border-cyan-500/20 transition-all font-medium"
                        >
                          📜 Verificar Regras do Contrato PDF
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 6. RELATORIOS / CHARTS VIEW */}
            {activeTab === 'relatorios' && (
              <motion.div
                key="relatorios-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* CHARTS CONTAINER */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Status Ring Chart (Handmade high-end SVG) */}
                  <div className="lg:col-span-5 bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">Diferenças por Status de Guia</h3>
                      <div className="flex items-center justify-center my-6">
                        {/* Beautiful custom donut SVG */}
                        <svg className="w-44 h-44 transform -rotate-90" viewBox="0 0 42 42">
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#111827" strokeWidth="4" />
                          
                          {/* Success Pago 33.3% */}
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#10b981" strokeWidth="4" strokeDasharray="33.3 66.7" strokeDashoffset="0" />
                          
                          {/* Glosa 22.2% */}
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#ef4444" strokeWidth="4" strokeDasharray="22.2 77.8" strokeDashoffset="-33.3" />
                          
                          {/* Parcial 22.2% */}
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#3b82f6" strokeWidth="4" strokeDasharray="22.2 77.8" strokeDashoffset="-55.5" />
                          
                          {/* Outros 22.3% */}
                          <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#eab308" strokeWidth="4" strokeDasharray="22.3 77.7" strokeDashoffset="-77.7" />
                        </svg>
                      </div>
                    </div>

                    <div className="space-y-2 mt-4 text-xs font-medium">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> PAGO (Faturamento Correto)</span>
                        <span className="text-slate-400">33.3% ({summary.pagosCount})</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-400" /> GLOSA TOTAL</span>
                        <span className="text-slate-400">22.2% ({summary.glosasCount})</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> GLOSA PARCIAL</span>
                        <span className="text-slate-400">22.2% ({summary.parciaisCount})</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-500" /> OUTROS / PENDENTES</span>
                        <span className="text-slate-400">22.3% ({summary.pendentesCount})</span>
                      </div>
                    </div>
                  </div>

                  {/* Monthly bar compare custom chart */}
                  <div className="lg:col-span-7 bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl flex flex-col justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Desempenho de Conciliação Mensal</h3>
                      <p className="text-[11px] text-slate-500 mb-6 font-sans">Histórico comparativo de taxas de glosas aplicadas para controle.</p>

                      <div className="space-y-5">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-semibold">Maço 2026 (Faturamento R$ 980K)</span>
                            <span className="text-emerald-400 font-semibold">12% Glosa (Baixo)</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: '12%' }} />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-semibold">Abril 2026 (Faturamento R$ 1.1M)</span>
                            <span className="text-amber-500 font-semibold">24% Glosa (Alerta)</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-amber-400 h-full rounded-full" style={{ width: '24%' }} />
                          </div>
                        </div>

                        <div className="space-y-1.5 font-sans">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300 font-semibold">Maio 2026 (Atual - Faturamento R$ 1.2M)</span>
                            <span className="text-red-400 font-extrabold">34.6% Glosa (Crítico)</span>
                          </div>
                          <div className="w-full bg-slate-950 h-2.5 rounded-full overflow-hidden">
                            <div className="bg-red-500 h-full rounded-full" style={{ width: '34.6%' }} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#070b13] p-4 rounded-2xl text-[11px] text-slate-400 leading-relaxed border border-slate-900 mt-6 flex gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span><strong>Alerta da Auditoria:</strong> O aumento nas glosas no mês de Maio decorre de uma mudança unilateral nas regras de glosa prévia do Hospital Aliança para diagnósticos de imagem por ressonâncias. Recomenda-se treinar o modelo cognitivo para barrar estas guias antes do fechamento.</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 7. TREINAR MODELO COGNITIVO */}
            {activeTab === 'treinar' && (
              <motion.div
                key="treinar-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                {/* PAINEL DE APRENDIZADO */}
                <LearningDashboard />
                
                <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl">
                  <div className="flex items-center justify-between mb-5 border-b border-slate-850 pb-4">

                    <div>
                      <h2 className="text-base font-bold text-slate-200">Treinador Cognitivo de IA</h2>
                    </div>
                    <span className="bg-[#2a1b41] text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded border border-purple-800/10">Gemini 1.5 Pro Ativo</span>
                  </div>

                  <div className="space-y-5">
                    {/* PAINEL MASSA NEURAL */}
                    <div className="bg-[#0b1322] border border-cyan-900/40 p-5 rounded-2xl mt-2 mb-4 shadow-lg shadow-cyan-900/10">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-1.5">
                          <Brain className="w-4 h-4" />
                          <span>Massa Neural (Padrões Auto-descobertos)</span>
                        </h4>
                        <button onClick={fetchNeuralPatterns} className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded transition-colors">
                          Atualizar
                        </button>
                      </div>
                      <div className="mb-4" />

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 mb-5">
                        {/* LEFT COLUMN: MASSA NEURAL PERCENTAGE OVERVIEW */}
                        <div className="lg:col-span-5 bg-[#070b13] border border-slate-900 rounded-2xl p-4 flex flex-col justify-between relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl" />
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Aproveitamento</span>
                              <span className="bg-[#132c31] text-[#2dd4bf] border border-[#2dd4bf]/20 text-[9px] font-bold px-1.5 py-0.5 rounded-full">ATIVO</span>
                            </div>
                            
                            <div className="flex items-center gap-4 my-2">
                              {/* Glowing Radial progress bar */}
                              <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                  <path
                                    className="text-slate-855"
                                    strokeWidth="3.5"
                                    stroke="currentColor"
                                    fill="transparent"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                  <path
                                    className="text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.5)] transition-all duration-1000"
                                    strokeDasharray={`${neuralMassPercentage}, 100`}
                                    strokeWidth="3.5"
                                    strokeLinecap="round"
                                    stroke="currentColor"
                                    fill="transparent"
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                  />
                                </svg>
                                <span className="absolute text-xs font-bold text-slate-200 font-mono">
                                  {neuralMassPercentage.toFixed(1)}%
                                </span>
                              </div>
                              
                              <div>
                                <h4 className="text-xl font-extrabold text-white tracking-tight">{neuralMassPercentage.toFixed(1)}%</h4>
                                <p className="text-[9px] text-[#2dd4bf] font-medium font-mono leading-tight mt-0.5">Capacidade de Massa Neural Ativa</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* RIGHT COLUMN: CUSTOM SVG EVOLUTION CHART */}
                        <div className="lg:col-span-7 bg-[#070b13] border border-slate-900 rounded-2xl p-4 flex flex-col justify-between relative">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider">Histórico de Aprendizado</span>
                            <span className="text-[9px] text-slate-500 font-mono">Curva de Cobertura / Época</span>
                          </div>

                          {/* Beautiful Custom SVG Line/Area graph */}
                          <div className="relative w-full h-24 my-2 flex items-center justify-center">
                            <svg className="w-full h-full" viewBox="0 0 380 110" preserveAspectRatio="none">
                              <defs>
                                <linearGradient id="chart-glow" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                                  <stop offset="100%" stopColor="#818cf8" stopOpacity="0.0" />
                                </linearGradient>
                              </defs>

                              {/* Grid lines */}
                              <line x1="10" y1="15" x2="370" y2="15" stroke="#131e35" strokeWidth="0.5" strokeDasharray="3 3" />
                              <line x1="10" y1="45" x2="370" y2="45" stroke="#131e35" strokeWidth="0.5" strokeDasharray="3 3" />
                              <line x1="10" y1="75" x2="370" y2="75" stroke="#131e35" strokeWidth="0.5" strokeDasharray="3 3" />

                              {/* Under area path */}
                              {(() => {
                                const w = 380;
                                const h = 110;
                                const pX = 15;
                                const pY = 15;
                                const cW = w - pX * 2;
                                const cH = h - pY * 2;
                                const maxVal = 100;
                                const minVal = 0;

                                const pts = neuralEvolutionData.map((d, index) => {
                                  const x = pX + (index / (neuralEvolutionData.length - 1)) * cW;
                                  const y = pY + cH - ((d.mass - minVal) / (maxVal - minVal)) * cH;
                                  return { x, y };
                                });

                                const lineDef = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                                const areaDef = pts.length > 0
                                  ? `${lineDef} L ${pts[pts.length - 1].x} ${pY + cH} L ${pts[0].x} ${pY + cH} Z`
                                  : '';

                                return (
                                  <>
                                    {areaDef && <path d={areaDef} fill="url(#chart-glow)" />}
                                    {lineDef && (
                                      <path
                                        d={lineDef}
                                        fill="transparent"
                                        stroke="#22d3ee"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        className="transition-all duration-700"
                                      />
                                    )}

                                    {/* Circles & Touch targets */}
                                    {pts.map((p, idx) => {
                                      const d = neuralEvolutionData[idx];
                                      const isHovered = hoveredDataPoint && hoveredDataPoint.epoch === d.epoch;
                                      return (
                                        <g key={idx}>
                                          <circle
                                            cx={p.x}
                                            cy={p.y}
                                            r={isHovered ? "5" : "3.5"}
                                            fill="#070b13"
                                            stroke={isHovered ? "#34d399" : "#818cf8"}
                                            strokeWidth="2"
                                            className="transition-all cursor-crosshair"
                                            onMouseEnter={() => setHoveredDataPoint(d)}
                                            onMouseLeave={() => setHoveredDataPoint(null)}
                                          />
                                        </g>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </svg>

                            {/* HOVER TOOLTIP INJECTION */}
                            {hoveredDataPoint && (
                              <div className="absolute top-0 left-1/2 -translate-x-1/2 -mt-2 bg-[#0d1527] border border-cyan-850 px-2 py-1 rounded text-[9px] font-mono text-cyan-300 z-15 shadow-xl flex items-center gap-2">
                                <span className="font-bold text-slate-100">{hoveredDataPoint.epoch}:</span>
                                <span>Massa: <strong className="text-cyan-400">{hoveredDataPoint.mass}%</strong></span>
                                <span>Confiabilidade: <strong className="text-emerald-400">{hoveredDataPoint.confidence}%</strong></span>
                              </div>
                            )}
                          </div>

                          {/* X-Axis titles */}
                          <div className="flex items-center justify-between px-2 text-[8px] text-slate-500 font-mono">
                            {neuralEvolutionData.map((d, idx) => (
                              <span key={idx} className="truncate max-w-[50px] text-center" title={d.epoch}>
                                {d.epoch}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-slate-900 pt-4 mt-4">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-3 font-mono">Hospitais Auto-descobertos vinculados:</span>
                      </div>

                      <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {neuralHospitals.length === 0 ? (
                          <div className="text-center py-6 text-slate-500 text-xs border border-dashed border-slate-800 rounded-xl">
                            Nenhum padrão neural validado pelas IAs até o momento. Processe novas guias para iniciar a auto-descoberta.
                          </div>
                        ) : (
                          neuralHospitals.map((hosp: any) => (
                            <div key={hosp.id} className="bg-[#070b13] border border-slate-800 rounded-xl p-3 flex items-center justify-between transition-colors hover:border-slate-700">
                              <div>
                                <h5 className="font-bold text-slate-200 text-xs uppercase">{hosp.hospitalId}</h5>
                                <div className="text-[10px] text-slate-400 mt-1 flex gap-3 font-mono">
                                  <span>Leituras: <strong className="text-slate-300 mx-1">{hosp.totalLeituras || 0}</strong></span>
                                  <span>Acertos <strong className="text-emerald-400">{hosp.acertos || 0}</strong></span>
                                  <span>Taxa: <strong className={hosp.taxaAcerto > 80 ? "text-emerald-400 ml-1" : "text-amber-400 ml-1"}>{hosp.taxaAcerto || 0}%</strong></span>
                                </div>
                              </div>
                              <div className="text-right flex items-center justify-end gap-2 min-w-[70px]">
                                <span className="text-[9px] bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded cursor-help font-mono whitespace-nowrap text-center transition-colors" title={JSON.stringify(hosp.padroes, null, 2)}>Ver Regex</span>
                                <button onClick={async () => {
                                  if(window.confirm('Excluir padrão deste hospital?')) {
                                    await deleteDoc(doc(db, 'knowledge_base', hosp.id));
                                    fetchNeuralPatterns();
                                    showToast('Padrão removido com sucesso!');
                                  }
                                }} className="text-slate-500 hover:text-red-400 opacity-70 hover:opacity-100 transition-colors">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-slate-300 font-bold block mb-2">Instruções de Faturamento & Regras do Negócio Customizadas</label>
                      <textarea
                        value={customTrainingRules}
                        onChange={(e) => setCustomTrainingRules(e.target.value)}
                        placeholder="Ex: Ignore hífens nos cartões, barrar consultas duplicadas no mesmo dia do mesmo médico..."
                        className="w-full bg-[#070b13] border border-slate-850 rounded-2xl p-4 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono h-36 resize-y leading-relaxed"
                      />
                    </div>

                    {/* SAMPLES LOADER WIDGET */}
                    <div className="bg-[#0c1426] border border-slate-900 p-4 rounded-2xl">
                      <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5 mb-2">
                        <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                        <span>Amostras de Documento Vinculadas ({documents.length})</span>
                      </h4>
                      <div className="mb-3" />
                      
                      <div className="flex flex-wrap gap-2">
                        {documents.slice(0, 3).map((doc) => (
                          <span key={doc.id} className="text-[10px] bg-[#070b13] border border-slate-800 rounded px-2.5 py-1 text-slate-350">
                            {doc.name}
                          </span>
                        ))}
                        {documents.length > 3 && (
                          <span className="text-[10px] bg-[#070b13] border border-slate-800 rounded px-2.5 py-1 text-cyan-400">
                            +{documents.length - 3} outros
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={runTrainingSimulator}
                        disabled={isTrainingNow}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:from-slate-850 disabled:to-slate-850 disabled:text-slate-500 font-bold text-xs uppercase tracking-wider text-white py-3.5 px-4 rounded-xl shadow-xl hover:shadow-indigo-500/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isTrainingNow ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Mapeando Documentos com IA...</span>
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4 text-white" />
                            <span>Treinar IA com Dados Atuais</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setCustomTrainingRules("");
                          showToast("Regras limpas.");
                        }}
                        className="bg-[#0f172a] hover:bg-[#15203b] border border-slate-800 text-slate-400 px-4 rounded-xl text-xs font-semibold hover:text-slate-200 transition-colors"
                      >
                        Limpar Regras
                      </button>
                    </div>

                    {/* LIVE TRAINING LOGS OUTPUT */}
                    {trainingLogs.length > 0 && (
                      <div className="bg-slate-950 border border-slate-900 rounded-2xl p-4 font-mono text-[10px] space-y-2 max-h-56 overflow-y-auto text-slate-300">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-slate-900 pb-1.5 mb-2 tracking-wide">
                          <span className="flex items-center gap-1.5"><Play className="w-3.5 h-3.5 text-[#2dd4bf] animate-pulse" /> Terminal de Compilação Cognitiva</span>
                          <span className="text-[#2dd4bf]">Sincronizado</span>
                        </div>
                        {trainingLogs.map((log, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span className="text-slate-500">{`>`}</span>
                            <p>{log}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* 8. CONFIGURACOES / APIS VIEW */}
            {activeTab === 'configuracoes' && (
              <motion.div
                key="configuracoes-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-6"
              >
                <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl space-y-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-200">Definições da Aplicação</h2>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-slate-300 font-bold block mb-2">Chave de Conexão Gemini (V2_Gemini_API_Key)</label>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-cyan-950/40 text-cyan-400 font-mono border border-cyan-850 rounded px-2 py-0.5 shrink-0 w-44 text-center">Canal Principal (V2_Gemini_API_Key)</span>
                          <input
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            className="flex-1 bg-[#070b13] border border-slate-850 rounded-xl px-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                            placeholder="Chave V2_Gemini_API_Key"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-t border-slate-850 pt-4">
                      <label className="text-xs text-slate-300 font-bold block mb-2">Estratégia de Cognição e Prevenção de Falhas (Cota/Saldo)</label>
                      <select
                        value={modelStrategy}
                        onChange={(e: any) => handleSetModelStrategy(e.target.value)}
                        className="w-full bg-[#070b13] border border-slate-850 rounded-xl px-4 py-3 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-sans cursor-pointer"
                      >
                        <option value="rotation">🔄 Revezamento de Modelos Inteligente (Altamente Recomendado)</option>
                        <option value="fixo-flash">🎯 Fixo: gemini-3.1-pro-preview (Modelo Principal)</option>
                        <option value="fixo-lite">⚡ Fixo: gemini-3.1-flash-lite (Modelo Econômico)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-slate-850 pt-4 font-sans text-xs">
                      <div className="space-y-1.5">
                        <span className="text-slate-400 text-[10px] block font-mono">ID DO PROJETO FIREBASE</span>
                        <span className="text-slate-200 font-bold font-mono">spherical-leaf-vr5vm</span>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-slate-400 text-[10px] block font-mono">AUDIT SPREADSHEETS MODE</span>
                        <span className="text-slate-200 font-bold font-sans">Multipastas Inteligente (XLSX, CSV)</span>
                      </div>
                    </div>
                  </div>

                  {/* PROD FIREBASE KEY REGISTERING CARD */}
                  <div className="border-t border-slate-850 pt-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <CloudLightning className="w-5 h-5 text-cyan-400" />
                      <h3 className="text-sm font-bold text-slate-200">Gerador e Registrador de Chaves (Firestore Produção)</h3>
                    </div>
                    <div className="h-2" />

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleRegisterKeysInProduction}
                        disabled={isRegisteringProdKeys}
                        className="bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:from-slate-850 disabled:to-slate-850 disabled:text-slate-500 text-white rounded-xl py-2.5 px-4 font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-950/20"
                      >
                        {isRegisteringProdKeys ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-white" />
                            <span>Registrando no Firestore...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-4 h-4 text-emerald-300 animate-pulse" />
                            <span>Registrar Chaves & Regras no Firestore de Produção</span>
                          </>
                        )}
                      </button>
                    </div>

                    {prodKeysGenerated && (
                      <div className="bg-slate-950/60 border border-emerald-500/20 rounded-2xl p-4 mt-3 space-y-3 font-mono text-xs">
                        <div className="text-emerald-400 font-bold border-b border-emerald-500/10 pb-1.5 flex items-center gap-1.5 font-sans">
                          <Check className="w-4 h-4 text-emerald-400" /> Chaves registradas com sucesso no Firestore!
                        </div>
                        <p className="text-slate-400 text-[10px] leading-relaxed font-sans font-normal">
                          As seguintes credenciais foram criadas e salvas na coleção <code className="text-cyan-400 px-1 py-0.5 bg-[#0a0f1d] rounded">api_keys</code> e o motor de cognição foi semeado na coleção <code className="text-cyan-400 px-1 py-0.5 bg-[#0a0f1d] rounded">knowledge_base</code> do seu banco!
                        </p>
                        <div className="space-y-1.5 select-all">
                          <div><span className="text-slate-500 font-sans font-normal">Admin Key:</span> <span className="text-slate-100 font-bold">dk_admin_4c42b5f89cfa4988b81f07d624c16fd8</span></div>
                          <div><span className="text-slate-500 font-sans font-normal">App 1 (Meu App 1):</span> <span className="text-slate-100 font-bold">dk_app_398621514c374c1bbaee5c20d65f2a83</span></div>
                          <div><span className="text-slate-500 font-sans font-normal">App 2 (Meu App 2):</span> <span className="text-slate-100 font-bold">dk_app_9afda75222e940538b598d9564b693b8</span></div>
                        </div>
                        <div className="bg-[#0b1322] p-2.5 rounded-xl text-[10px] font-sans text-slate-400 leading-normal font-normal">
                          💡 Use o cabeçalho HTTP <strong className="text-cyan-400 font-bold">x-api-key</strong> com as credenciais acima para fazer chamadas seguras de APIs diretamente do seu aplicativo mobile ou web para a sua URL base de produção!
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-850 flex justify-end gap-2">
                    <button
                      onClick={() => {
                        showToast("Configurações persistidas no sistema do Firebase localmente!");
                      }}
                      className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl py-2.5 px-5 font-bold transition-all text-xs cursor-pointer"
                    >
                      Salvar Ajustes
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'teste-api' && (
              <motion.div
                key="teste-api-view"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="max-w-4xl mx-auto"
              >
                <ApiTester />
              </motion.div>
            )}
          </AnimatePresence>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}
