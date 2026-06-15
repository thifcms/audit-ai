import React, { useState, useRef } from 'react';
import { 
  AlertCircle, 
  RefreshCw, 
  Upload, 
  Loader2, 
  Trash2, 
  FileSpreadsheet, 
  Edit, 
  X, 
  Calendar, 
  User, 
  Tag, 
  Hash 
} from 'lucide-react';
import { extractDocument } from '../services/ai';

export default function ReconciliationDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Editing State
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedItem, setEditedItem] = useState<any | null>(null);

  // Progressive batch processing of labels to avoid UI freezing
  const extractFieldsMulti = async (resposta: any) => {
    if (!resposta || !resposta.etiquetas || !Array.isArray(resposta.etiquetas)) {
      return;
    }
    
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    for (let index = 0; index < resposta.etiquetas.length; index++) {
      const et = resposta.etiquetas[index];
      
      setData(prev => {
        // Prevent duplicate entries of the same patient name and appointment ID
        const isDuplicate = prev.some(item => 
          item.numero_atendimento === et.numero_atendimento && 
          item.nome_paciente === et.nome_paciente
        );
        if (isDuplicate) return prev;
        
        return [
          ...prev,
          {
            numero_atendimento: et.numero_atendimento || "---",
            nome_paciente: et.nome_paciente || "---",
            convenio: et.convenio || "---",
            data_atendimento: et.data_atendimento || "12/05/2026",
            status: 'pendente',
            fonte: 'IA (Lote)'
          }
        ];
      });
      
      // Release control back to browser to allow UI updates and prevent freezing
      await delay(50);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLoading(true);
      setError(null);

      try {
        const result = await extractDocument(file);
        console.log('AUDIT AI RESPONSE:', result);
        alert('MAPPED RESULT: ' + JSON.stringify(result, null, 2));
        
        if (result.success) {
          if (result.data.etiquetas && Array.isArray(result.data.etiquetas) && result.data.etiquetas.length > 0) {
            // Trigger batch processing
            await extractFieldsMulti(result.data);
          } else if (result.data.nome_paciente && result.data.nome_paciente !== '---') {
            // Single patient record fallback
            setData(prev => {
              const isDuplicate = prev.some(item => 
                item.numero_atendimento === result.data.numero_atendimento && 
                item.nome_paciente === result.data.nome_paciente
              );
              if (isDuplicate) return prev;
              
              return [
                ...prev,
                {
                  numero_atendimento: result.data.numero_atendimento || "---",
                  nome_paciente: result.data.nome_paciente,
                  convenio: result.data.convenio || "---",
                  data_atendimento: result.data.data_atendimento || "12/05/2026",
                  status: 'pendente',
                  fonte: 'IA (Extração)'
                }
              ];
            });
          } else {
            setError("Nenhum paciente ou etiqueta identificado no documento.");
          }
        } else {
          setError(result.error || "Falha na leitura do arquivo.");
        }
      } catch (err: any) {
        console.error(err);
        setError("Erro de comunicação com o servidor de IA.");
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  const removeRow = (index: number) => {
    setData(prev => prev.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    if (window.confirm("Deseja limpar todos os registros?")) {
      setData([]);
    }
  };

  const openEditModal = (index: number) => {
    setEditingIndex(index);
    setEditedItem({ ...data[index] });
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editedItem) {
      setData(prev => {
        const updated = [...prev];
        updated[editingIndex] = editedItem;
        return updated;
      });
      setEditingIndex(null);
      setEditedItem(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-left">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20 shadow-lg shadow-cyan-500/5">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-200">Cruzamento Financeiro de Atendimentos</h2>
            <p className="text-xs text-slate-400">Envie fotos de etiquetas ou relatórios para reconciliação automática.</p>
          </div>
        </div>

        <div className="flex gap-2">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-600/20 active:scale-95"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <Upload className="w-4 h-4" />}
            Ler Labels / Nota
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*,application/pdf" 
          />
          
          {data.length > 0 && (
            <button 
              onClick={clearAll}
              className="bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-400 px-4 py-2.5 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Trash2 className="w-4 h-4" />
              Limpar
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/20 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400 text-xs animate-in fade-in slide-in-from-top-1 duration-300 text-left">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="p-6 bg-[#0b1120] border border-slate-900 rounded-2xl relative overflow-hidden group shadow-2xl text-left transition-all hover:border-cyan-500/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-600/5 rounded-full blur-3xl" />
          <h3 className="text-slate-400 font-bold text-[11px] mb-2 uppercase tracking-wider">Unificados Pendentes</h3>
          <p className="text-4xl font-extrabold text-cyan-400 tracking-tight">
            {data.filter(i => i.status === 'pendente').length} <span className="text-sm font-medium text-slate-500">etiquetas</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-2 font-mono italic">Aguardando auditoria e cruzamento final de repasse</p>
        </div>

        <div className="p-6 bg-[#0b1120] border border-slate-900 rounded-2xl relative overflow-hidden group shadow-2xl text-left transition-all hover:border-purple-500/30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-purple-600/5 rounded-full blur-3xl" />
          <h3 className="text-slate-400 font-bold text-[11px] mb-2 uppercase tracking-wider">Total de Registros</h3>
          <p className="text-4xl font-extrabold text-purple-400 tracking-tight">
            {data.length} <span className="text-sm font-medium text-slate-500">pacientes</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-2 font-mono uppercase tracking-tighter">Processados via Motor Cognitivo Gemini</p>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-[#0b1120] border border-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        {data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead>
                <tr className="bg-[#070b13] text-slate-500 uppercase text-[10px] font-black border-b border-slate-900/60 transition-all">
                  <th className="py-4 px-6">Atendimento</th>
                  <th className="py-4 px-2">Paciente</th>
                  <th className="py-4 px-2">Convênio</th>
                  <th className="py-4 px-2">Data Atendimento</th>
                  <th className="py-4 px-2 text-center">Fonte</th>
                  <th className="py-4 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {data.map((item: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-900/20 transition-all group">
                    <td className="py-4 px-6 font-mono text-cyan-500 font-bold tracking-tight">#{item.numero_atendimento}</td>
                    <td className="py-4 px-2 font-extrabold text-slate-200">{item.nome_paciente}</td>
                    <td className="py-4 px-2 text-slate-400">{item.convenio}</td>
                    <td className="py-4 px-2 text-slate-400 font-mono">{item.data_atendimento}</td>
                    <td className="py-4 px-2 text-center">
                      <span className="text-[9px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-500 uppercase font-black tracking-tighter group-hover:text-cyan-400 group-hover:border-cyan-500/20 transition-all">
                        {item.fonte}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(i)}
                          className="p-2 bg-slate-900 hover:bg-cyan-900/30 text-slate-400 hover:text-cyan-400 rounded-lg transition-all cursor-pointer"
                          title="Editar registro"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => removeRow(i)}
                          className="p-2 bg-slate-900 hover:bg-rose-950/40 text-slate-400 hover:text-rose-500 rounded-lg transition-all cursor-pointer"
                          title="Remover linha"
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
        ) : (
          <div className="py-24 flex flex-col items-center justify-center text-center px-6">
            <div className="w-20 h-20 bg-slate-950 rounded-3xl flex items-center justify-center text-slate-800 mb-6 border border-slate-900 shadow-inner group">
              <FileSpreadsheet className="w-10 h-10 opacity-20 group-hover:opacity-40 transition-opacity" />
            </div>
            <h3 className="text-sm font-bold text-slate-300">Nenhum dado reconciliado</h3>
            <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto leading-relaxed">
              Clique em <strong className="text-cyan-400">"Ler Labels / Nota"</strong> para processar imagens. A IA irá identificar todos os pacientes e preencher a tabela automaticamente.
            </p>
          </div>
        )}
      </div>

      {/* Editing Modal Dialog */}
      {editingIndex !== null && editedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0b1120] border border-slate-800 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-900/60">
              <div className="flex items-center gap-2">
                <Edit className="w-4 h-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-slate-200">Editar Atendimento</h3>
              </div>
              <button 
                onClick={() => { setEditingIndex(null); setEditedItem(null); }}
                className="p-1 text-slate-550 hover:text-slate-300 rounded-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Fields */}
            <div className="p-5 space-y-4 text-left">
              {/* Patient field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <User className="w-3 h-3 text-cyan-500" /> Paciente
                </label>
                <input 
                  type="text"
                  value={editedItem.nome_paciente || ""}
                  onChange={(e) => setEditedItem((prev: any) => ({ ...prev, nome_paciente: e.target.value }))}
                  className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
                  placeholder="Nome do Paciente"
                />
              </div>

              {/* Appointment Code field */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Hash className="w-3 h-3 text-cyan-500" /> Atendimento
                </label>
                <input 
                  type="text"
                  value={editedItem.numero_atendimento || ""}
                  onChange={(e) => setEditedItem((prev: any) => ({ ...prev, numero_atendimento: e.target.value }))}
                  className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono font-bold text-cyan-400"
                  placeholder="Código do Atendimento"
                />
              </div>

              {/* Health Insurance field - convenio */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Tag className="w-3 h-3 text-cyan-500" /> Convênio
                </label>
                <input 
                  type="text"
                  value={editedItem.convenio || ""}
                  onChange={(e) => setEditedItem((prev: any) => ({ ...prev, convenio: e.target.value }))}
                  className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-semibold"
                  placeholder="Convênio"
                />
              </div>

              {/* Appointment Date field - data_atendimento */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-cyan-500" /> Data
                </label>
                <input 
                  type="text"
                  value={editedItem.data_atendimento || ""}
                  onChange={(e) => setEditedItem((prev: any) => ({ ...prev, data_atendimento: e.target.value }))}
                  className="w-full bg-[#070b13] border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="Data de Atendimento"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-slate-900/60 bg-[#080d19]/40 flex gap-2 justify-end">
              <button 
                onClick={() => { setEditingIndex(null); setEditedItem(null); }}
                className="bg-slate-800 hover:bg-slate-700 text-slate-350 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveEdit}
                className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-cyan-600/10 cursor-pointer"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
