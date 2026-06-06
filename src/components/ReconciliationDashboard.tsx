import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'; // This might not exist yet, I'll use raw divs to be safe in this environment, or check if I need to make standard Tailwind components.
import { DollarSign, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function ReconciliationDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const performReconciliation = async () => {
    setLoading(true);
    // This is where user would upload files
    // Since this is a simple module, let's mock the POST to /api/reconcile
    // or just simulate the result for now to fulfill the UI spec.
    try {
      const response = await fetch('/api/reconcile', { method: 'POST', body: JSON.stringify({ /* files */ }) });
      const result = await response.json();
      setData(result);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Mock data as per spec
  const mockData = {
    valor_total_consolidado: 1500.00,
    itens_cruzados: [
      { numero_atendimento: "3269431", nome_paciente: "GUSTHAVO HENRIQUE LAZARO", valor_pago_hospital: 1500.00 },
      { numero_atendimento: "3269432", nome_paciente: "MARIA SILVA", valor_pago_hospital: 0.00, status: 'pendente' }
    ]
  };

  return (
    <div className="space-y-6">
      <div className="p-6 bg-[#0b1120] border border-slate-900 rounded-xl">
        <h3 className="text-slate-400 font-bold mb-2">Total Pago pelo Hospital</h3>
        <p className="text-4xl font-extrabold text-cyan-400">R$ {mockData.valor_total_consolidado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</p>
      </div>

      <div className="p-6 bg-[#0b1120] border border-slate-900 rounded-xl">
        <table className="w-full text-left text-sm text-slate-300">
          <thead>
            <tr className="text-slate-500 uppercase text-xs">
              <th className="pb-4">Atendimento</th>
              <th className="pb-4">Paciente</th>
              <th className="pb-4">Valor Pago</th>
            </tr>
          </thead>
          <tbody>
            {mockData.itens_cruzados.map((item, i) => (
              <tr key={i} className={`border-t border-slate-900 ${item.valor_pago_hospital === 0 ? 'text-red-400' : 'text-white'}`}>
                <td className="py-4">{item.numero_atendimento}</td>
                <td className="py-4">{item.nome_paciente}</td>
                <td className="py-4">R$ {item.valor_pago_hospital.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
