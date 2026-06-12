import React, { useState, useRef } from 'react';
import { DollarSign, AlertCircle, CheckCircle, RefreshCw, Upload, Image as ImageIcon, Loader2, Trash2, FileSpreadsheet } from 'lucide-react';
import { extractDocument } from '../services/ai';

export default function ReconciliationDashboard() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setLoading(true);
      setError(null);

      try {
        const result = await extractDocument(file);
        
        if (result.success) {
          const newItems: any[] = [];
          
          // 1. Process root patient if it exists and has valid data
          if (result.data.nome_paciente && result.data.nome_paciente !== '---') {
            newItems.push({
              numero_atendimento: result.data.numero_atendimento || "---",
              nome_paciente: result.data.nome_paciente,
              convenio: result.data.convenio || "---",
              valor_pago_hospital: result.data.valor || result.data.valorTotal || 0,
              status: 'processado',
              fonte: 'IA (Extração)'
            });
          }

          // 2. Process multiple labels (etiquetas) if found
          if (result.data.etiquetas && Array.isArray(result.data.etiquetas)) {
            result.data.etiquetas.forEach((et: any) => {
              // Avoid duplicates if root was already added (basic check by name + number)
              const isDuplicate = newItems.some(item => 
                item.numero_atendimento === et.numero_atendimento && 
                item.nome_paciente === et.nome_paciente
              );
              if (!isDuplicate) {
                newItems.push({
                  numero_atendimento: et.numero_atendimento || "---",
                  nome_paciente: et.nome_paciente || "---",
                  convenio: et.convenio || "---",
                  valor_pago_hospital: et.valor || et.valorTotal || 0,
                  status: 'processado',
                  fonte: 'IA (Etiqueta)'
                });
              }
            });
          }

          if (newItems.length > 0) {
            setData(prev => [...prev, ...newItems]);
          } else {
            setError("Nenhum paciente ou etiqueta identificado na imagem.");
          }
        } else {
          setError(result.error || "Falha na leitura da imagem.");
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

  const totalPago = data.reduce((sum, item) => sum + (Number(item.valor_pago_hospital) || 0), 0);

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
          <h3 className="text-slate-400 font-bold text-[11px] mb-2 uppercase tracking-wider">Total Extraído (Valores)</h3>
          <p className="text-4xl font-extrabold text-cyan-400 tracking-tight">
            R$ {totalPago.toLocaleString('pt-BR', {minimumFractionDigits: 2})}
          </p>
          <p className="text-[10px] text-slate-500 mt-2 font-mono italic">Baseado em documentos fiscais e etiquetas identificadas</p>
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
                  <th className="py-4 px-2 text-right">Valor Extraído</th>
                  <th className="py-4 px-2 text-center">Fonte</th>
                  <th className="py-4 px-6 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/40">
                {data.map((item: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-900/20 transition-all group">
                    <td className="py-4 px-6 font-mono text-cyan-500 font-bold tracking-tight">#{item.numero_atendimento}</td>
                    <td className="py-4 px-2 font-extrabold text-slate-200">{item.nome_paciente}</td>
                    <td className="py-4 px-2 text-slate-400">{item.convenio}</td>
                    <td className={`py-4 px-2 text-right font-black font-mono transition-colors ${item.valor_pago_hospital > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>
                      R$ {Number(item.valor_pago_hospital).toLocaleString('pt-BR', {minimumFractionDigits: 2})}
                    </td>
                    <td className="py-4 px-2 text-center">
                      <span className="text-[9px] bg-slate-900 border border-slate-800 px-2 py-0.5 rounded-md text-slate-500 uppercase font-black tracking-tighter group-hover:text-cyan-400 group-hover:border-cyan-500/20 transition-all">
                        {item.fonte}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button 
                        onClick={() => removeRow(i)}
                        className="p-2 hover:bg-rose-950/40 text-slate-650 hover:text-rose-500 rounded-lg transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                        title="Remover linha"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
    </div>
  );
}

