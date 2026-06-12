import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Sparkles, 
  RotateCcw, 
  FileText, 
  HelpCircle, 
  AlertCircle, 
  CheckCircle,
  Copy,
  BrainCircuit,
  MessageSquareCode
} from 'lucide-react';
import { DriveFile, ChatMessage, FileAnalysis } from '../types';

interface ChatPanelProps {
  token: string | null;
  file: DriveFile;
}

export default function ChatPanel({ token, file }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // Suggested Prompts based on file type
  const getSuggestions = () => {
    if (file.mimeType === 'application/vnd.google-apps.document' || file.mimeType === 'application/pdf') {
      return [
        "Faça um resumo detalhado dos pontos-chave",
        "Qual é o objetivo principal deste documento?",
        "Extraia os principais números ou datas mencionados",
        "Crie 3 perguntas para simular uma prova sobre o conteúdo"
      ];
    }
    if (file.mimeType === 'application/vnd.google-apps.spreadsheet' || file.mimeType === 'text/csv') {
      return [
        "Analise a estrutura dos dados desta planilha",
        "Encontre padrões ou insights quantitativos relevantes",
        "Ajude-me a entender as colunas e métricas descritas",
        "Crie uma lista com as 5 principais conclusões dos dados"
      ];
    }
    return [
      "Faça um resumo analítico deste arquivo",
      "Qual é a finalidade principal e mensagem central?",
      "Quais são os destaques e propostas mais relevantes?",
      "Explique a importância desse material de forma simplificada"
    ];
  };

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Reset chat on file change
  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [file]);

  const handleSendMessage = async (customMessage?: string) => {
    const messageText = (customMessage || inputValue).trim();
    if (!messageText || !token) return;

    if (!customMessage) {
      setInputValue('');
    }

    // Add user message to state
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: messageText,
      timestamp: new Date().toISOString()
    };

    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    setLoading(true);
    setError(null);

    try {
      // Map history to server-accepted structure: { role: 'user' | 'model', text: string }
      const formatHistory = messages.map(m => ({
        role: m.role,
        text: m.text
      }));

      const activeStrategy = typeof window !== 'undefined' ? localStorage.getItem('model_strategy') || 'rotation' : 'rotation';

      const response = await fetch('/api/analyze-file', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-api-key': import.meta.env.VITE_AUDIT_AI_KEY || 'dk_admin_4c42b5f89cfa4988b81f07d624c16fd8'
        },
        body: JSON.stringify({
          fileId: file.id,
          fileName: file.name,
          mimeType: file.mimeType,
          message: messageText,
          chatHistory: formatHistory,
          modelStrategy: activeStrategy
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Erro interno (${response.status}: ${response.statusText})`);
      }

      const data = await response.json();
      
      const modelMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: data.text,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, modelMsg]);
    } catch (err: any) {
      console.error("Erro na análise:", err);
      setError(err.message || "Houve uma falha crítica ao processar sua pergunta pelo Gemini.");
    } finally {
      setLoading(false);
    }
  };

  // Clear chat
  const handleResetChat = () => {
    if (window.confirm("Deseja realmente limpar o histórico de chat para este arquivo?")) {
      setMessages([]);
      setError(null);
    }
  };

  // Trigger default auto analysis
  const handleAutoAnalysis = () => {
    handleSendMessage("Faça uma análise profunda e completa deste arquivo, nos dando um resumo executivo estruturado, pontos principais e sugestões práticas recomendadas.");
  };

  // Custom Markdown renderer
  const renderFormattedText = (text: string) => {
    // Process string and structure into segments
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      // Unordered list items
      if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
        const itemText = line.trim().substring(2);
        return (
          <li key={idx} className="ml-5 list-disc text-xs text-slate-700 dark:text-slate-350 leading-relaxed mb-1.5">
            {formatBoldItalic(itemText)}
          </li>
        );
      }
      // Ordered list items
      const orderedMatch = line.trim().match(/^(\d+)\.\s(.*)/);
      if (orderedMatch) {
         return (
          <li key={idx} className="ml-5 list-decimal text-xs text-slate-700 dark:text-slate-350 leading-relaxed mb-1.5">
            {formatBoldItalic(orderedMatch[2])}
          </li>
         );
      }
      // Headings (###, ##, #)
      if (line.trim().startsWith('### ')) {
        return <h5 key={idx} className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-4 mb-2 tracking-tight">{formatBoldItalic(line.trim().substring(4))}</h5>;
      }
      if (line.trim().startsWith('## ')) {
        return <h4 key={idx} className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-5 mb-2.5 tracking-tight border-b border-slate-100 dark:border-slate-800 pb-1">{formatBoldItalic(line.trim().substring(3))}</h4>;
      }
      if (line.trim().startsWith('# ')) {
        return <h3 key={idx} className="text-base font-extrabold text-slate-900 dark:text-slate-100 mt-6 mb-3 tracking-tight">{formatBoldItalic(line.trim().substring(2))}</h3>;
      }
      // Blockquote
      if (line.trim().startsWith('> ')) {
        return (
          <blockquote key={idx} className="border-l-4 border-blue-550 pl-3 italic text-slate-500 dark:text-slate-400 my-2 text-xs">
            {formatBoldItalic(line.trim().substring(2))}
          </blockquote>
        );
      }
      // Normal paragraph
      if (line.trim() === '') {
        return <div key={idx} className="h-3.5" />;
      }
      return (
        <p key={idx} className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed mb-1.5">
          {formatBoldItalic(line)}
        </p>
      );
    });
  };

  // Replace markdown **bold** and `code` tags inside a line
  const formatBoldItalic = (text: string) => {
    // Basic bold **text** replacement
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-bold text-slate-900 dark:text-slate-50">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-rose-600 dark:text-rose-400">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  return (
    <div id="chat-panel-container" className="flex-1 flex flex-col h-full bg-white dark:bg-slate-950">
      {/* Top Bar with metadata */}
      <div id="chat-header" className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-900/30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="shrink-0 p-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-blue-600 dark:text-blue-400 border border-blue-100/40">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 text-left">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate pr-4" title={file.name}>
              {file.name}
            </h4>
            <p className="text-[10px] text-slate-400 font-mono tracking-tighttruncate">
              ID: {file.id.substring(0, 15)}... • {file.mimeType.split('/').pop()}
            </p>
          </div>
        </div>

        {messages.length > 0 && (
          <button
            id="clear-chat-btn"
            onClick={handleResetChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-650 dark:text-slate-400 border border-slate-200 dark:border-slate-750 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Limpar Chat</span>
          </button>
        )}
      </div>

      {/* Messages Scroll Area */}
      <div id="chat-messages-scroll" className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {messages.length === 0 ? (
          // Welcome Dashboard / Landing Card
          <div className="max-w-2xl mx-auto py-8 sm:py-16 text-center flex flex-col items-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="p-8 bg-blue-50/35 dark:bg-blue-950/10 border border-blue-100/60 dark:border-blue-900/10 rounded-2xl w-full flex flex-col items-center shadow-sm"
            >
              <div id="ai-glowing-shield" className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-500 flex items-center justify-center text-white shadow-md mb-6 animate-pulse">
                <BrainCircuit className="w-6 h-6" />
              </div>

              <h3 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 mb-2">
                Leitor de Arquivo Inteligente Ativo
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
                Você selecionou <strong className="text-slate-700 dark:text-slate-350">{file.name}</strong>. Eu posso ler o conteúdo completo, gerar resumos estruturados e responder perguntas específicas de forma rica em detalhes.
              </p>

              <button
                id="auto-analysis-trigger-btn"
                onClick={handleAutoAnalysis}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-650 text-white font-semibold text-xs transition-colors flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99] cursor-pointer shadow-md hover:shadow-lg"
              >
                <Sparkles className="w-4 h-4" />
                <span>Análise Completa com Gemini IA</span>
              </button>
            </motion.div>

            {/* Suggestions Block */}
            <div id="gdrive-suggestions-section" className="w-full max-w-xl text-left mt-8">
              <p className="text-[11px] font-bold text-slate-450 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5" /> Sugestões de Perguntas Rápidas
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {getSuggestions().map((suggestion, idx) => (
                  <button
                    key={idx}
                    id={`suggested-card-${idx}`}
                    onClick={() => handleSendMessage(suggestion)}
                    className="p-3 text-left border border-slate-200 dark:border-slate-800 bg-slate-50/50 hover:bg-blue-50/20 hover:border-blue-200 dark:bg-slate-900/20 dark:hover:bg-slate-900/40 rounded-xl transition-all hover:shadow-sm cursor-pointer group flex items-start gap-2 text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors font-medium">
                      {suggestion}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Chat Conversational Threads
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((msg, i) => {
              const isModel = msg.role === 'model';
              return (
                <motion.div
                  key={msg.id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 text-left ${isModel ? 'justify-start' : 'justify-end'}`}
                >
                  {isModel && (
                    <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">
                      AI
                    </div>
                  )}

                  <div className={`max-w-[85%] rounded-2xl px-4 py-3.5 shadow-sm border ${
                    isModel 
                      ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-850 text-slate-800 dark:text-slate-150' 
                      : 'bg-blue-600 border-blue-650 text-white'
                  }`}>
                    <div className="prose dark:prose-invert">
                      {isModel ? renderFormattedText(msg.text) : (
                        <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>

                    <div className={`flex items-center justify-between mt-2.5 pt-2 border-t text-[10px] ${
                      isModel 
                        ? 'border-slate-200 dark:border-slate-800 text-slate-400' 
                        : 'border-blue-500/30 text-blue-100'
                    }`}>
                      <span>
                        {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      {isModel && (
                        <button
                          onClick={() => copyToClipboard(msg.text, i)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1"
                          title="Copiar resposta"
                        >
                          {copiedIndex === i ? (
                            <>
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-[10px] text-emerald-550 font-medium">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span className="text-[10px]">Copiar</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {!isModel && (
                    <div className="w-8 h-8 rounded-lg bg-emerald-550 text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">
                      U
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Loading Indicator */}
            {loading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-3 text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xs shrink-0 font-bold shadow-sm">
                  AI
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-2xl flex items-center gap-3">
                  <div id="loader-dots" className="flex space-x-1.5">
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce delay-100" />
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce delay-200" />
                    <span className="w-2.5 h-2.5 bg-blue-600 rounded-full animate-bounce delay-300" />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium animate-pulse">
                    O Gemini está extraindo e analisando as informações do arquivo...
                  </span>
                </div>
              </motion.div>
            )}

            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-150 rounded-2xl flex items-start gap-3 text-left">
                <AlertCircle className="w-5 h-5 text-red-650 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-red-800 dark:text-red-300">Falha na Resposta</p>
                  <p className="text-[11px] text-red-600 dark:text-red-400 mt-1">{error}</p>
                </div>
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input Message Area */}
      <div id="chat-input-bar" className="p-4 border-t border-slate-200 dark:border-slate-800 shrink-0 bg-slate-50/40 dark:bg-slate-900/20">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="max-w-3xl mx-auto flex gap-2"
        >
          <input
            id="user-conversation-input"
            type="text"
            placeholder="Perguntar ao Gemini sobre qualquer detalhe deste arquivo..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={loading || !token}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-250 dark:border-slate-750 text-xs rounded-xl text-slate-855 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-550 focus:border-blue-550 transition-all shadow-sm disabled:bg-slate-100 dark:disabled:bg-slate-850"
          />
          <button
            id="chat-send-submit-btn"
            type="submit"
            disabled={loading || !inputValue.trim() || !token}
            className="p-2.5 px-4 bg-blue-600 hover:bg-blue-650 text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-50 disabled:hover:bg-blue-600 shadow-md enabled:hover:scale-[1.02] cursor-pointer"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
