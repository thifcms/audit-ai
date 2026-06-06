import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  FileJson, 
  Search, 
  Image as ImageIcon,
  Sparkles,
  ArrowRight,
  Activity,
  Zap,
  RefreshCw,
  Terminal
} from 'lucide-react';
import { extractDocument } from '../services/ai';

export default function ApiTester() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<{
    gemini: { status: 'idle' | 'connected' | 'failed'; error?: string; response?: string; durationMs?: number; statusCode?: number };
    groq: { status: 'idle' | 'connected' | 'failed'; error?: string; response?: string; durationMs?: number; statusCode?: number };
    lastChecked?: string;
  } | null>(null);

  const [diagnosticLogs, setDiagnosticLogs] = useState<Array<{ timestamp: string; message: string; type: 'info' | 'success' | 'error' | 'warning' }>>([]);

  const addLog = (message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    setDiagnosticLogs(prev => [...prev, { timestamp, message, type }]);
  };

  const testConnections = async () => {
    setTestingConnection(true);
    setDiagnosticLogs([]);
    addLog('Iniciando varredura sequencial de conectividade direta com os canais de IA...', 'info');
    
    addLog('Enviando sinal de ping HTTP para a rota de diagnóstico /api/ai-test...', 'info');
    const startTimeClient = Date.now();
    try {
      const response = await fetch('/api/ai-test');
      const roundTripMs = Date.now() - startTimeClient;
      
      addLog(`Resposta recebida do Servidor Express. Status HTTP: ${response.status} (${response.statusText}). Latência round-trip do cliente: ${roundTripMs}ms.`, response.ok ? 'success' : 'error');

      const data = await response.json();
      
      if (data && data.results) {
        setConnectionStatus({
          gemini: {
            status: data.results.gemini.status,
            error: data.results.gemini.error,
            response: data.results.gemini.response,
            durationMs: data.results.gemini.durationMs,
            statusCode: data.results.gemini.statusCode
          },
          groq: {
            status: data.results.groq.status,
            error: data.results.groq.error,
            response: data.results.groq.response,
            durationMs: data.results.groq.durationMs,
            statusCode: data.results.groq.statusCode
          },
          lastChecked: new Date().toLocaleTimeString('pt-BR')
        });

        // Gemini Log output
        if (data.results.gemini.status === 'connected') {
          addLog(`[Gemini SDK] Conexão bem-sucedida! Canal principal ativo. Resposta HTTP da API do Google: ${data.results.gemini.statusCode}. Tempo de processamento interno: ${data.results.gemini.durationMs}ms.`, 'success');
          addLog(`[Gemini SDK] Texto do teste retornado com sucesso: "${data.results.gemini.response}"`, 'info');
        } else {
          addLog(`[Gemini SDK] Falha no canal de comunicação primária (Google Gemini). Código HTTP retornado: ${data.results.gemini.statusCode}. Erro: ${data.results.gemini.error || 'Erro desconhecido'}`, 'error');
        }

        // Groq Log output
        if (data.results.groq.status === 'connected') {
          addLog(`[Groq Fallback] Conexão bem-sucedida! Canal de contingência baseado no Llama-3.3-70b-versatile ativo. Resposta HTTP Groq Cloud: ${data.results.groq.statusCode}. Tempo de processamento interno: ${data.results.groq.durationMs}ms.`, 'success');
          addLog(`[Groq Fallback] Texto do teste retornado pela API da Groq: "${data.results.groq.response}"`, 'info');
        } else {
          addLog(`[Groq Fallback] Canal secundário de contingência (Groq Cloud) indisponível. Código HTTP retornado: ${data.results.groq.statusCode}. Detalhes: ${data.results.groq.error || 'Variável de ambiente GROQ_API_KEY ausente'}`, 'warning');
        }

        addLog('Varredura e validação das rotas de extração concluída com êxito.', 'info');
      } else {
        addLog('Erro de integridade dos dados: A resposta do servidor não continha a estrutura esperada.', 'error');
        setConnectionStatus({
          gemini: { status: 'failed', error: 'Formato de resposta inesperado do servidor' },
          groq: { status: 'failed', error: 'Formato de resposta inesperado do servidor' },
          lastChecked: new Date().toLocaleTimeString('pt-BR')
        });
      }
    } catch (err: any) {
      addLog(`Falha crítica de comunicação: ${err.message || err}`, 'error');
      setConnectionStatus({
        gemini: { status: 'failed', error: err.message || 'Erro de conexão com a API' },
        groq: { status: 'failed', error: err.message || 'Erro de conexão com a API' },
        lastChecked: new Date().toLocaleTimeString('pt-BR')
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
      setError(null);
    }
  };

  const testImageReading = async () => {
    if (!file) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const data = await extractDocument(file);

      if (data.success) {
        setResult({
          success: true,
          analysis: {
            documentType: data.documentType,
            summary: data.summary,
            keyFields: data.data
          },
          meta: {
            aiProcessed: true,
            aiProvider: data.usedProvider.toUpperCase(),
            aiModel: data.usedModel
          }
        });
      } else {
        setError(data.error || 'Erro ao processar o documento com a arquitetura direta.');
      }
    } catch (err: any) {
      setError(err.message || 'Falha na conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const highlightFields = ['nomePaciente', 'numeroAtendimento', 'convenio', 'medico'];

  const renderValue = (key: string, data: { value: any, confidence: number }) => {
    const isLowConfidence = data.confidence < 85;
    
    return (
      <div key={key} className={`flex items-center gap-2 py-2 px-3 rounded-md border ${isLowConfidence ? 'bg-amber-950/20 border-amber-500/30' : 'bg-[#060910] border-slate-800'}`}>
        <div className="flex flex-col w-32 shrink-0">
          <span className="text-[10px] text-slate-400 font-bold uppercase">{key.replace('_', ' ')}</span>
          <span className={`text-[9px] font-mono ${isLowConfidence ? 'text-amber-500' : 'text-emerald-500'}`}>Confiança: {data.confidence}%</span>
        </div>
        {isLowConfidence ? (
          <input 
            type="text" 
            defaultValue={String(data.value)} 
            className="text-[11px] bg-slate-900 border border-slate-700 rounded p-1 w-full text-white"
            onChange={(e) => {
                // Here we would store the corrected value in a state
            }}
          />
        ) : (
          <span className="text-[11px] text-slate-300 font-medium truncate w-full">
            {String(data.value)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* CONNECTION STATUS TRACKER CARD */}
      <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Activity className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-200 font-sans tracking-tight">Painel de Diagnóstico das IAs</h2>
              <p className="text-xs text-slate-400">Teste o status das chaves de API e se a comunicação direta está ativa.</p>
            </div>
          </div>
          <button
            onClick={testConnections}
            disabled={testingConnection}
            className="text-xs font-bold bg-[#141b2d] hover:bg-slate-800 disabled:text-slate-600 text-slate-300 border border-slate-800 rounded-xl py-2 px-4 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {testingConnection ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>Pingar Conexões</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* GEMINI CARD */}
          <div className="bg-[#070b13] border border-slate-900 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-cyan-400 font-mono">Gemini (Principal)</span>
                {connectionStatus ? (
                  connectionStatus.gemini.status === 'connected' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ATIVO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      ERRO
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                    SEM TESTE
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mb-2">
                Modelos de contingência configurados: <code className="font-mono text-cyan-500/80">gemini-3.5-flash</code>, <code className="font-mono text-cyan-500/80">flash-lite</code>, <code className="font-mono text-cyan-500/80">pro-preview</code>.
              </p>
              
              {connectionStatus?.gemini.status === 'connected' && (
                <div className="mb-2 grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-900/50 p-2 rounded-xl border border-slate-900">
                  <div>Status HTTP: <span className="text-emerald-400 font-bold">{connectionStatus.gemini.statusCode || 200} OK</span></div>
                  <div>Tempo: <span className="text-cyan-400 font-bold">{connectionStatus.gemini.durationMs}ms</span></div>
                </div>
              )}

              {connectionStatus?.gemini.error && (
                <div className="p-2 bg-rose-950/20 border border-rose-500/10 text-rose-400 text-[10px] rounded-lg font-mono">
                  {connectionStatus.gemini.error}
                </div>
              )}
              {connectionStatus?.gemini.response && (
                <div className="p-2 bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 text-[10px] rounded-lg font-mono">
                  Resposta: "{connectionStatus.gemini.response}"
                </div>
              )}
            </div>
          </div>

          {/* GROQ CARD */}
          <div className="bg-[#070b13] border border-slate-900 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-purple-400 font-mono">Groq (Contingência)</span>
                {connectionStatus ? (
                  connectionStatus.groq.status === 'connected' ? (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      ATIVO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                      ERRO
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                    SEM TESTE
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mb-2">
                Modelo de OCR e extração estruturada: <code className="font-mono text-purple-500/80">llama-3.3-70b-versatile</code>.
              </p>

              {connectionStatus?.groq.status === 'connected' && (
                <div className="mb-2 grid grid-cols-2 gap-2 text-[10px] font-mono bg-slate-900/50 p-2 rounded-xl border border-slate-900">
                  <div>Status HTTP: <span className="text-emerald-400 font-bold">{connectionStatus.groq.statusCode || 200} OK</span></div>
                  <div>Tempo: <span className="text-cyan-400 font-bold">{connectionStatus.groq.durationMs}ms</span></div>
                </div>
              )}

              {connectionStatus?.groq.error && (
                <div className="p-2 bg-rose-950/20 border border-rose-500/10 text-rose-400 text-[10px] rounded-lg font-mono">
                  {connectionStatus.groq.error}
                </div>
              )}
              {connectionStatus?.groq.response && (
                <div className="p-2 bg-emerald-950/20 border border-emerald-500/10 text-emerald-400 text-[10px] rounded-lg font-mono">
                  Resposta: "{connectionStatus.groq.response}"
                </div>
              )}
            </div>
          </div>
        </div>

        {/* DIAGNOSTIC EVENT LOG TERMINAL */}
        {diagnosticLogs.length > 0 && (
          <div className="mt-5 border border-slate-900 bg-[#070b13] rounded-2xl p-4 overflow-hidden">
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-900/60 text-slate-400 text-xs font-mono">
              <Terminal className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span>Console de Eventos Diagnósticos & Monitoramento de IAs</span>
            </div>
            <div className="max-h-48 overflow-y-auto font-mono text-[11px] space-y-1.5 scrollbar-thin select-text">
              {diagnosticLogs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-2 leading-relaxed">
                  <span className="text-slate-600 shrink-0 select-none">[{log.timestamp}]</span>
                  <span className={
                    log.type === 'success' ? 'text-emerald-400' :
                    log.type === 'error' ? 'text-rose-400 font-semibold' :
                    log.type === 'warning' ? 'text-amber-400 font-medium' : 'text-slate-300'
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {connectionStatus?.lastChecked && (
          <p className="text-[9px] text-slate-500 text-right mt-3">
            Último teste realizado às {connectionStatus.lastChecked}
          </p>
        )}
      </div>

      <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400">
            <ImageIcon className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200">Testar Leitura de Imagem</h2>
            <p className="text-xs text-slate-400">Teste o motor OCR + Gemini AI enviando uma foto de um documento médico.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 w-full border-2 border-dashed border-slate-800 hover:border-cyan-500/40 rounded-2xl p-8 transition-all cursor-pointer bg-[#0e172a]/30 group text-center"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              accept="image/*"
            />
            
            {file ? (
              <div className="space-y-2">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-xs font-bold text-slate-200">{file.name}</p>
                <p className="text-[10px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
                <button 
                  onClick={(e) => { e.stopPropagation(); setFile(null); }}
                  className="text-[10px] text-rose-400 hover:underline"
                >
                  Remover
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-12 h-12 bg-slate-800 text-slate-400 rounded-full flex items-center justify-center mx-auto group-hover:bg-cyan-500/20 group-hover:text-cyan-400 transition-colors">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200 uppercase tracking-wider">Clique ou arraste a imagem</p>
                  <p className="text-[10px] text-slate-500 mt-1">PNG, JPG ou WEBP suportados</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 w-full md:w-auto">
            <button
              onClick={testImageReading}
              disabled={!file || loading}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 text-white rounded-xl py-4 px-8 text-xs font-bold transition-all shadow-xl shadow-cyan-500/10 flex items-center justify-center gap-2 min-w-[200px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Analisando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Testar Leitura de Imagem</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-rose-950/20 border border-rose-500/20 rounded-2xl p-4 flex items-start gap-3"
          >
            <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-200">Erro no Processamento</p>
              <p className="text-[11px] text-rose-400/80 mt-1">{error}</p>
            </div>
          </motion.div>
        )}

        {result && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            <div className="lg:col-span-12">
               <div className="bg-[#0b1120] border border-slate-900 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                  <div className="flex items-center justify-between mb-6 border-b border-slate-850 pb-4">
                    <div className="flex items-center gap-3">
                      <FileJson className="text-cyan-400 w-5 h-5" />
                      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">Resultado da Extração IA</h3>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${result.meta?.aiProcessed ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-500/20' : 'bg-slate-900 text-slate-400'}`}>
                      {result.meta?.aiProcessed ? <><Sparkles className="w-3 h-3" /> IA PROCESSED: TRUE</> : 'AI PROCESSED: FALSE'}
                    </div>
                  </div>

                  <div className="space-y-4">
                     {/* Detalhes do documento */}
                     <div className="bg-[#070b13] border border-slate-850 rounded-2xl p-4">
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                           <Search className="w-3 h-3" /> Metadados Básicos
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                           <div className="flex flex-col">
                              <span className="text-[9px] text-slate-500 uppercase">Tipo Documento</span>
                              <span className="text-[11px] text-cyan-300 font-medium">{result.analysis?.documentType || '---'}</span>
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[9px] text-slate-500 uppercase">Provider IA</span>
                              <span className="text-[11px] text-purple-400 font-mono">{result.meta?.aiProvider || 'None'}</span>
                           </div>
                           <div className="flex flex-col">
                              <span className="text-[9px] text-slate-500 uppercase">Modelo</span>
                              <span className="text-[11px] text-slate-400 font-mono">{result.meta?.aiModel || '---'}</span>
                           </div>
                        </div>
                        <div className="mt-3 pt-3 border-t border-slate-850">
                           <span className="text-[9px] text-slate-500 uppercase block mb-1">Resumo Executivo</span>
                           <p className="text-[11px] text-slate-300 leading-relaxed italic">"{result.analysis?.summary || 'Nenhum resumo gerado.'}"</p>
                        </div>
                     </div>

                     {/* Key Fields com Destaque */}
                     <div className="space-y-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase px-1">Campos Extraídos (Key Fields)</p>
                        <div className="bg-[#070b13]/50 border border-slate-900 rounded-2xl p-2 divide-y divide-slate-850/50">
                           {result.analysis?.keyFields && Object.keys(result.analysis.keyFields).length > 0 ? (
                              Object.entries(result.analysis.keyFields)
                                .filter(([key]) => !key.endsWith('_confidence'))
                                .map(([key, val]) => {
                                  const confidence = result.analysis.keyFields[`${key}_confidence`] || 100;
                                  return renderValue(key, { value: val, confidence: confidence as number });
                                })
                           ) : (
                             <p className="text-[10px] text-slate-600 p-4 text-center italic">Nenhum campo chave extraído.</p>
                           )}
                        </div>
                     </div>

                     {/* Raw JSON Card */}
                     <div className="bg-slate-950/80 rounded-2xl p-6 border border-slate-900/50 mt-4 overflow-x-auto max-h-[400px] scrollbar-thin">
                        <div className="flex items-center gap-2 mb-4">
                           <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">JSON Output</span>
                        </div>
                        <pre className="text-xs text-slate-400 font-mono p-2">
                          {JSON.stringify(result, null, 2)}
                        </pre>
                     </div>
                  </div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
