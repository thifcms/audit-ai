/**
 * AI Service for Document Extraction
 * Integrates direct Gemini and Groq extraction channels.
 */

export interface HospitalTagData {
  atendimento: string;
  dataAtendimento: string;
  paciente: string;
  convenio: string;
  dataNascimento?: string;
  hospitalId?: string;
  etiquetas?: Array<{
    atendimento: string;
    dataAtendimento: string;
    paciente: string;
    convenio: string;
    dataNascimento?: string;
  }>;
}

export interface InvoiceItem {
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface InvoiceData {
  numeroNota: string;
  dataEmissao: string;
  emitente: string;
  cnpjEmitente: string;
  valorTotal: number;
  valorLiquido?: number;
  convenio?: string;
  paciente?: string;
  atendimento?: string;
  itens?: InvoiceItem[];
}

export interface UnifiedExtraction {
  documentType: 'etiqueta_hospitalar' | 'nota_fiscal' | 'outro';
  summary: string;
  // Hospital Tag Fields
  nome_paciente?: string;
  numero_atendimento?: string;
  paciente?: string;
  atendimento?: string;
  data_atendimento?: string;
  dataAtendimento?: string;
  convenio?: string;
  data_nascimento?: string;
  dataNascimento?: string;
  valor?: number;
  etiquetas?: Array<{
    nome_paciente?: string;
    numero_atendimento?: string;
    paciente?: string;
    atendimento?: string;
    data_atendimento?: string;
    dataAtendimento?: string;
    convenio?: string;
    data_nascimento?: string;
    dataNascimento?: string;
    valor?: number;
  }>;
  // Invoice Fields
  numeroNota?: string;
  dataEmissao?: string;
  emitente?: string;
  cnpjEmitente?: string;
  valorTotal?: number;
  valorLiquido?: number;
  itens?: InvoiceItem[];
}

export interface ExtractionResponse {
  success: boolean;
  documentType: 'etiqueta_hospitalar' | 'nota_fiscal' | 'outro';
  data: UnifiedExtraction;
  summary: string;
  usedModel: string;
  usedProvider: 'gemini' | 'groq';
  error?: string;
}

/**
 * Resizes an image File using Canvas to have a maximum dimension of 1200px.
 * Preserves aspect ratio and returns as standard base64 string (image/jpeg).
 */
export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 4000;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Unable to create canvas 2D context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Aumenta a qualidade para 100% (1.0) para garantir máxima resolução nos detalhes das etiquetas
        const compressedBase64 = canvas.toDataURL('image/jpeg', 1.0);
        resolve(compressedBase64);
      };
      img.onerror = () => {
        reject(new Error("Failed to load image for compression"));
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      reject(new Error("Failed to read image file"));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Converts other non-image files (e.g. PDF) to raw base64.
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data url prefix if present
      const base64Data = result.substring(result.indexOf(',') + 1);
      resolve(base64Data);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

/**
 * Main Direct Extraction API service call.
 * Handles compression of images, supports PDFs and other types, and posts to `/api/gemini/extract`.
 */
export async function extractDocument(
  file: File, 
  expectedType: 'etiqueta_hospitalar' | 'nota_fiscal' | 'outro' = 'outro',
  modelStrategy?: 'rotation' | 'fixo-lite' | 'fixo-flash'
): Promise<ExtractionResponse> {
  try {
    const isImage = file.type.startsWith('image/') || 
                    file.name.toLowerCase().endsWith('.png') || 
                    file.name.toLowerCase().endsWith('.jpg') || 
                    file.name.toLowerCase().endsWith('.jpeg') || 
                    file.name.toLowerCase().endsWith('.webp') ||
                    file.name.toLowerCase().endsWith('.heic') ||
                    file.name.toLowerCase().endsWith('.heif');
    
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    let base64Data = "";
    let mimeType = file.type;

    if (!mimeType) {
      if (file.name.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
      else if (file.name.toLowerCase().endsWith('.heic')) mimeType = 'image/heic';
      else if (file.name.toLowerCase().endsWith('.heif')) mimeType = 'image/heif';
      else mimeType = 'image/jpeg'; // default fallback for pictures
    }

    if (isImage) {
      // Compress with standard bounds
      try {
        if (file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
          // Send HEIC directly to backend as raw base64 - sharp/Gemini will handle
          const rawB64 = await fileToBase64(file);
          base64Data = rawB64;
        } else {
          const compressed = await compressImage(file);
          // Canvas output is already base64 with standard prefix
          base64Data = compressed.substring(compressed.indexOf(',') + 1);
          mimeType = 'image/jpeg'; // Compressed output is always converted to JPEG
        }
      } catch (err) {
        console.warn("Compression failed, fallback to raw base64:", err);
        const rawB64 = await fileToBase64(file);
        base64Data = rawB64;
      }
    } else {
      // PDF or other txt files
      base64Data = await fileToBase64(file);
    }

    // Attempt to read strategy state from localStorage if not specified
    const activeStrategy = modelStrategy || (typeof window !== 'undefined' ? localStorage.getItem('model_strategy') : null) || 'rotation';

    const payload = {
      fileBase64: base64Data,
      filename: file.name,
      mimeType: mimeType,
      expectedType: expectedType,
      modelStrategy: activeStrategy
    };

    const response = await fetch('/api/gemini/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': import.meta.env.VITE_AUDIT_AI_KEY || 'dk_admin_4c42b5f89cfa4988b81f07d624c16fd8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      let rawText = "";
      try { rawText = await response.text(); } catch (e) {}
      
      let errData: any = {};
      try { errData = JSON.parse(rawText); } catch (e) {}
      
      throw new Error(errData.error || `Servidor retornou status ${response.status}. Detalhes: ${rawText.substring(0, 300)}`);
    }

    const result = await response.json();
    return result as ExtractionResponse;

  } catch (error: any) {
    console.error("Direct document extraction failed:", error);
    return {
      success: false,
      documentType: 'outro',
      data: {
        documentType: 'outro',
        summary: "Não foi possível extrair os dados do documento devido a um erro."
      },
      summary: "Falha na extração de dados.",
      usedModel: "N/A",
      usedProvider: "gemini",
      error: error.message || "Erro desconhecido durante a comunicação com a API."
    };
  }
}
