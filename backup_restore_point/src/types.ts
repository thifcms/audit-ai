export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  iconLink?: string;
  modifiedTime?: string;
  size?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
}

export interface FileAnalysis {
  fileId: string;
  fileName: string;
  mimeType: string;
  summary?: string;
  chatHistory: ChatMessage[];
}

export interface DocumentRecord {
  id: string;
  name: string;
  size: string;
  type: 'faturamento' | 'repasse' | 'contrato' | 'outro';
  uploadedAt: string;
  status: 'processado' | 'pendente' | 'erro';
}

export interface PatientAuditItem {
  id: string;
  atendimento: string;
  nome: string;
  procedureId?: string;
  procedimento: string;
  valorFaturado: number;
  valorPago: number;
  divergencia: number;
  status: 'PAGO' | 'PENDENTE' | 'PARCIAL' | 'GLOSA' | 'NÃO ENCONTRADO' | 'DUPLICADO';
  motivoGlosa?: string;
}

export interface AuditSummary {
  totalPacientes: number;
  valorTotalFaturado: number;
  valorTotalPago: number;
  valorTotalDivergencia: number;
  taxaSucesso: number; // % logic matching
  pagosCount: number;
  pendentesCount: number;
  parciaisCount: number;
  glosasCount: number;
  naoEncontradosCount: number;
  duplicadosCount: number;
}
