import React, { useEffect, useState } from 'react';
import { 
  Brain, 
  Target, 
  Check, 
  X, 
  Trash2, 
  Edit3, 
  Sparkles, 
  TrendingUp, 
  FileText, 
  CheckCircle, 
  AlertTriangle 
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface LearnedExample {
  id: string;
  hospital: string;
  image_hash: string;
  confidence: 'high' | 'low';
  verified_by_user: boolean;
  created_at: string;
  extracted_data: {
    nome_paciente: string;
    numero_atendimento: string;
    convenio: string;
    data_atendimento?: string;
  };
}

interface StatsData {
  total_examples: number;
  by_hospital: { [key: string]: number };
  gemini_calls_last_7d: number;
  local_cache_hits_last_7d: number;
}

export default function LearningDashboard() {
  const [stats, setStats] = useState<StatsData>({
    total_examples: 0,
    by_hospital: {},
    gemini_calls_last_7d: 0,
    local_cache_hits_last_7d: 0
  });

  const [examples, setExamples] = useState<LearnedExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Correction Form state
  const [editForm, setEditForm] = useState({
    nome_paciente: '',
    numero_atendimento: '',
    convenio: '',
    data_atendimento: ''
  });

  const fetchData = async () => {
    try {
      const statsRes = await fetch('/api/learning/stats');
      const statsJSON = await statsRes.json();
      if (statsJSON.success) {
        setStats({
          total_examples: statsJSON.total_examples,
          by_hospital: statsJSON.by_hospital,
          gemini_calls_last_7d: statsJSON.gemini_calls_last_7d,
          local_cache_hits_last_7d: statsJSON.local_cache_hits_last_7d
        });
      }

      const examplesRes = await fetch('/api/learning/examples');
      const examplesJSON = await examplesRes.json();
      if (examplesJSON.success) {
        setExamples(examplesJSON.examples || []);
      }
    } catch (err) {
      console.error('Falha ao buscar dados de aprendizado:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConfirm = async (example: LearnedExample) => {
    try {
      const res = await fetch(`/api/learning/examples/${example.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify' })
      });
      const resJSON = await res.json();
      if (resJSON.success) {
        // Refresh local items
        setExamples(prev => prev.map(item => 
          item.id === example.id ? { ...item, verified_by_user: true, confidence: 'high' } : item
        ));
        // Refresh stats
        fetchData();
      }
    } catch (err) {
      console.error('Falha ao confirmar exemplo:', err);
    }
  };

  const handleDelete = async (exampleId: string) => {
    if (!window.confirm('Deseja realmente excluir este exemplo de aprendizado?')) return;
    try {
      const res = await fetch(`/api/learning/examples/${exampleId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete' })
      });
      const resJSON = await res.json();
      if (resJSON.success) {
        setExamples(prev => prev.filter(item => item.id !== exampleId));
        fetchData();
      }
    } catch (err) {
      console.error('Falha ao excluir exemplo:', err);
    }
  };

  const startCorrection = (example: LearnedExample) => {
    setEditingId(example.id);
    setEditForm({
      nome_paciente: example.extracted_data.nome_paciente || '',
      numero_atendimento: example.extracted_data.numero_atendimento || '',
      convenio: example.extracted_data.convenio || '',
      data_atendimento: example.extracted_data.data_atendimento || ''
    });
  };

  const submitCorrection = async (exampleId: string) => {
    try {
      const res = await fetch(`/api/learning/examples/${exampleId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          extracted_data: {
            nome_paciente: editForm.nome_paciente,
            numero_atendimento: editForm.numero_atendimento,
            convenio: editForm.convenio,
            data_atendimento: editForm.data_atendimento
          }
        })
      });
      const resJSON = await res.json();
      if (resJSON.success) {
        setEditingId(null);
        // Refresh examples list and statistics
        fetchData();
      }
    } catch (err) {
      console.error('Falha ao corrigir exemplo:', err);
    }
  };

  // Setup Pie Chart
  const pieData = [
    { name: 'Gemini (Nuvem)', value: stats.gemini_calls_last_7d, color: '#38bdf8' },
    { name: 'OCR Local (Cache)', value: stats.local_cache_hits_last_7d, color: '#10b981' }
  ].filter(d => d.value > 0);

  // Fallback to visual standard if empty
  if (pieData.length === 0) {
    pieData.push({ name: 'Gemini (Esperando Chamadas)', value: 1, color: '#475569' });
  }

  // Calculate efficiency percentage
  const totalCalls = stats.gemini_calls_last_7d + stats.local_cache_hits_last_7d;
  const localCacheEfficiency = totalCalls > 0 ? (stats.local_cache_hits_last_7d / totalCalls) * 100 : 0;

  // Count verified examples per hospital to compute progress towards Local Template OCR (Target = 10 verified)
  const computeHospitalProgress = (hospName: string) => {
    const verifieds = examples.filter(ex => ex.hospital === hospName && ex.verified_by_user).length;
    return {
      count: verifieds,
      percentage: Math.min((verifieds / 10) * 100, 100)
    };
  };

  return (
    <div className="space-y-6">
      {/* Top Learning Dashboard Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" id="stats-summary-row">
        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl flex items-center gap-4" id="stat-learned-examples">
          <div className="p-3 bg-cyan-950/50 rounded-lg border border-cyan-800/45">
            <Brain className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Aprendido</p>
            <p className="text-2xl font-black text-white mt-0.5">{stats.total_examples}</p>
            <p className="text-[9px] text-slate-500">Exemplos em learned_examples</p>
          </div>
        </div>

        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl flex items-center gap-4" id="stat-efficiency">
          <div className="p-3 bg-emerald-950/50 rounded-lg border border-emerald-800/45">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Automação (7d)</p>
            <p className="text-2xl font-black text-emerald-400 mt-0.5">{localCacheEfficiency.toFixed(1)}%</p>
            <p className="text-[9px] text-slate-500">Uso do OCR Local/Cache</p>
          </div>
        </div>

        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl flex items-center gap-4" id="stat-cached-hits">
          <div className="p-3 bg-purple-950/50 rounded-lg border border-purple-800/35">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Economia Local (7d)</p>
            <p className="text-2xl font-black text-purple-400 mt-0.5">{stats.local_cache_hits_last_7d}</p>
            <p className="text-[9px] text-slate-500">Chamadas Gemini evitadas</p>
          </div>
        </div>

        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl flex items-center gap-4" id="stat-total-calls">
          <div className="p-3 bg-slate-950/50 rounded-lg border border-slate-800">
            <FileText className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Logs de Registro (7d)</p>
            <p className="text-2xl font-black text-white mt-0.5">{totalCalls}</p>
            <p className="text-[9px] text-slate-500">Ref: {stats.gemini_calls_last_7d} nuvem / {stats.local_cache_hits_last_7d} cache</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hospital Learning Progress to Gemini-Free */}
        <div className="bg-[#0b1120] border border-slate-900 p-6 rounded-xl" id="hospital-recognition-panel">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" /> Metas de Automação por Hospital
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Alcançar **10 exemplos validados pelo usuário** permite que a Audit IA use **OCR Local sem cota Gemini** para este hospital.
          </p>
          
          <div className="space-y-4 max-h-72 overflow-y-auto pr-2">
            {Object.keys(stats.by_hospital).length === 0 ? (
              <p className="text-xs text-slate-500 italic p-4 text-center">Nenhum hospital registrado ainda.</p>
            ) : (
              Object.entries(stats.by_hospital).map(([hospital, totalLeituras]) => {
                const prog = computeHospitalProgress(hospital);
                const isCertified = prog.count >= 10;
                return (
                  <div key={hospital} className="p-3 bg-[#060910] border border-slate-950 rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-200">{hospital}</span>
                        {isCertified ? (
                          <span className="text-[8px] bg-emerald-950/80 border border-emerald-800/40 text-emerald-400 px-1.5 py-0.5 rounded font-black uppercase">
                            Liberado (100% Local)
                          </span>
                        ) : (
                          <span className="text-[8px] bg-amber-950/80 border border-amber-800/40 text-amber-500 px-1.5 py-0.5 rounded font-bold">
                            Falta {10 - prog.count} confirmados
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/30 px-2 py-0.5 rounded-full border border-cyan-900/35">
                        {totalLeituras} total
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Progresso de Certificação:</span>
                        <span>{prog.count} / 10 exemplos</span>
                      </div>
                      <div className="w-full bg-slate-950 rounded-full h-1.5">
                        <div 
                          className={`h-1.5 rounded-full transition-all duration-500 ${isCertified ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-cyan-500'}`} 
                          style={{ width: `${prog.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Dynamic Proportion Chart */}
        <div className="bg-[#0b1120] border border-slate-900 p-6 rounded-xl flex flex-col justify-between" id="distribution-chart-panel">
          <div>
            <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
              <Brain className="w-4 h-4 text-cyan-400" /> Distribuição de Execuções (7d)
            </h3>
            <p className="text-xs text-slate-500">Relação entre consultas ao modelo de nuvem e resoluções do cache.</p>
          </div>
          <div className="w-full h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie 
                  data={pieData} 
                  dataKey="value" 
                  nameKey="name" 
                  cx="50%" 
                  cy="50%" 
                  innerRadius={50}
                  outerRadius={75} 
                  paddingAngle={5}
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                >
                  {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{backgroundColor: '#060910', borderColor: '#1e293b', color: '#fff'}} />
                <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-around items-center border-t border-slate-900/40 pt-4 mt-2">
            <div className="text-center">
              <p className="text-[10px] text-slate-500">Processamento em Nuvem</p>
              <p className="text-sm font-bold text-cyan-400">{stats.gemini_calls_last_7d} chamadas</p>
            </div>
            <div className="text-center border-l border-slate-900/40 pl-4">
              <p className="text-[10px] text-slate-500">Resolvido Localmente</p>
              <p className="text-sm font-bold text-emerald-400">{stats.local_cache_hits_last_7d} requisições</p>
            </div>
          </div>
        </div>
      </div>

      {/* Validation Queue of Captured Examples */}
      <div className="bg-[#0b1120] border border-slate-900 rounded-xl p-6" id="learning-validation-queue">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-cyan-400" /> Fila de Validação de Exemplos (Aprendizado Proativo)
        </h3>
        <p className="text-xs text-slate-400 mb-6">
          Exemplos são salvos de cada extração. Marque-os como confirmados para alimentar o poucos-shots (Few-Shot) da Audit IA.
        </p>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Carregando fila de aprendizado...</div>
        ) : examples.length === 0 ? (
          <div className="p-12 text-center rounded-xl border border-dashed border-slate-900 text-xs text-slate-500 bg-[#060910]/40">
            Nenhum exemplo capturado na fila. Comece a enviar etiquetas para alimentar o banco.
          </div>
        ) : (
          <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
            {examples.map((example) => {
              const isEditing = editingId === example.id;

              return (
                <div 
                  key={example.id} 
                  className={`p-4 border rounded-xl transition-all duration-200 ${example.verified_by_user ? 'bg-emerald-950/20 border-emerald-950/85' : 'bg-[#060910] border-slate-950'}`}
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    {/* Badge and Title info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">{example.hospital}</span>
                        {example.verified_by_user ? (
                          <span className="text-[8px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            ✓ Confirmado
                          </span>
                        ) : example.confidence === 'high' ? (
                          <span className="text-[8px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800 px-1.5 py-0.5 rounded-md">
                            Confiança Alta
                          </span>
                        ) : (
                          <span className="text-[8px] font-bold bg-amber-950 text-amber-500 border border-amber-800 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            <AlertTriangle className="w-2 h-2" /> Confiança Baixa
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-500 font-mono">HASH: {example.image_hash}</p>
                    </div>

                    {/* Operational Action buttons */}
                    {!example.verified_by_user && (
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <button 
                              onClick={() => submitCorrection(example.id)}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                              title="Salvar correções"
                            >
                              <Check className="w-3.5 h-3.5" /> Salvar
                            </button>
                            <button 
                              onClick={() => setEditingId(null)}
                              className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-lg"
                              title="Cancelar edição"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button 
                              onClick={() => handleConfirm(example)}
                              className="px-2.5 py-1.5 bg-[#0b1120] hover:bg-emerald-950/40 border border-slate-800 hover:border-emerald-800 text-slate-300 hover:text-emerald-400 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                              title="Confirmar extração atual"
                            >
                              <Check className="w-3.5 h-3.5" /> Confirmar
                            </button>
                            <button 
                              onClick={() => startCorrection(example)}
                              className="px-2.5 py-1.5 bg-[#0b1120] hover:bg-amber-950/40 border border-slate-800 hover:border-amber-800 text-slate-300 hover:text-amber-500 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all"
                              title="Corrigir campos"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> Corrigir
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => handleDelete(example.id)}
                          className="p-1.5 bg-[#0b1120] hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/60 text-slate-400 hover:text-rose-400 rounded-lg transition-all"
                          title="Excluir exemplo"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Form toggle and layout display */}
                  {isEditing ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4 border-t border-slate-900/60 pt-4">
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Nome do Paciente</label>
                        <input 
                          type="text" 
                          value={editForm.nome_paciente}
                          onChange={(e) => setEditForm({ ...editForm, nome_paciente: e.target.value })}
                          className="w-full bg-[#060910] border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Atendimento</label>
                        <input 
                          type="text" 
                          value={editForm.numero_atendimento}
                          onChange={(e) => setEditForm({ ...editForm, numero_atendimento: e.target.value })}
                          className="w-full bg-[#060910] border border-slate-800 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Convênio</label>
                        <input 
                          type="text" 
                          value={editForm.convenio}
                          onChange={(e) => setEditForm({ ...editForm, convenio: e.target.value })}
                          className="w-full bg-[#060910] border border-slate-800 rounded px-2 py-1 text-xs text-white uppercase"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Data de Atendimento</label>
                        <input 
                          type="text" 
                          value={editForm.data_atendimento}
                          onChange={(e) => setEditForm({ ...editForm, data_atendimento: e.target.value })}
                          className="w-full bg-[#060910] border border-slate-800 rounded px-2 py-1 text-xs text-white"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3 border-t border-slate-900/40 pt-3 text-xs">
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Paciente</span>
                        <span className="font-semibold text-slate-350">{example.extracted_data.nome_paciente || '---'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Atendimento / Reg</span>
                        <span className="font-mono text-cyan-400">{example.extracted_data.numero_atendimento || '---'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Convênio</span>
                        <span className="font-semibold text-slate-350">{example.extracted_data.convenio || '---'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[9px] uppercase font-bold">Data Atendimento</span>
                        <span className="text-slate-350">{example.extracted_data.data_atendimento || '---'}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
