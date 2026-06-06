import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Activity, Brain, Server, Target, TrendingUp, DollarSign } from 'lucide-react';

export default function LearningDashboard() {
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "knowledge_base"), (snapshot) => {
      const items: any[] = [];
      snapshot.forEach((doc) => items.push({ id: doc.id, ...doc.data() }));
      setData(items);
    });
    return () => unsubscribe();
  }, []);

  // Aggregate Metrics
  const totalLeituras = data.reduce((sum, item) => sum + (item.totalLeituras || 0), 0);
  const totalAcertos = data.reduce((sum, item) => sum + (item.acertos || 0), 0);
  const parserSucessoRate = totalLeituras > 0 ? (totalAcertos / totalLeituras) * 100 : 0;
  
  const aiEconomia = data.reduce((sum, item) => sum + (item.economizado || 0), 0);
  
  // AI Breakdown
  const geminiCount = data.reduce((sum, item) => sum + (item.geminiUsado || 0), 0);
  const groqCount = data.reduce((sum, item) => sum + (item.groqUsado || 0), 0);
  const parserCount = totalLeituras - geminiCount - groqCount;

  const pieData = [
    { name: 'Gemini', value: geminiCount, color: '#06b6d4' },
    { name: 'Groq', value: groqCount, color: '#8b5cf6' },
    { name: 'Parser Local', value: parserCount > 0 ? parserCount : 0, color: '#10b981' }
  ].filter(d => d.value > 0);

  const lastReading = data.length > 0 
    ? data.sort((a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime())[0]
    : null;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Total Processado</p>
          <p className="text-2xl font-bold text-white mt-1">{totalLeituras}</p>
        </div>
        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Taxa Acerto Parser</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{parserSucessoRate.toFixed(1)}%</p>
        </div>
        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Economia IA (Chamadas)</p>
          <p className="text-2xl font-bold text-cyan-400 mt-1">{aiEconomia}</p>
        </div>
        <div className="bg-[#0b1120] border border-slate-900 p-4 rounded-xl">
          <p className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Última Leitura</p>
          <p className="text-xs font-semibold text-white mt-1.5">{lastReading ? `${new Date(lastReading.savedAt).toLocaleDateString('pt-BR')} ${new Date(lastReading.savedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}` : 'N/A'}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{lastReading?.hospitalId || 'N/A'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#0b1120] border border-slate-900 p-6 rounded-xl">
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-emerald-400" /> Hospitais Aprendidos</h3>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {data.map((item, i) => (
              <div key={i} className="flex justify-between items-center text-xs p-2 bg-[#060910] rounded">
                <span className="text-slate-300">{item.hospitalId}</span>
                <span className="font-mono text-cyan-400">{item.totalLeituras || 0} leituras</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0b1120] border border-slate-900 p-6 rounded-xl flex items-center justify-center">
            <div className="w-full h-60">
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                    {pieData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{backgroundColor: '#060910', borderColor: '#1e293b'}} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
        </div>
      </div>
    </div>
  );
}
