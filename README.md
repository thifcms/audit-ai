# DocEngine — IA de Documentos (Pré-treinada)

Motor de inteligência para leitura, extração e auditoria de qualquer tipo de documento.
**A IA já vem treinada** — funciona no primeiro deploy, sem configuração adicional.

---

## ✅ A IA já reconhece e extrai dados de:

| Categoria       | Documentos                                                              |
|-----------------|-------------------------------------------------------------------------|
| **Fiscal**      | NFe, CTe, MDFe, NFCe, NFS-e, DANFE, SPED, GNRE, DARF, GPS             |
| **Financeiro**  | Extratos bancários (todos os bancos), Boletos, PIX, TED, Faturas       |
| **Contábil**    | Balancete, Balanço Patrimonial, DRE, DFC, Livro Caixa, Conciliação     |
| **Trabalhista** | Holerite, Rescisão, Férias, FGTS, INSS, CAGED, eSocial                |
| **Jurídico**    | Contratos, Procurações, Atas, Certidões, Escrituras                    |
| **Logística**   | Pedidos, Ordens de Serviço, Romaneios, BL, AWB, Packing List           |
| **Imagens**     | Fotos de documentos, recibos manuscritos, cupons fiscais, etiquetas    |
| **Planilhas**   | Excel, CSV, qualquer estrutura tabular                                  |

---

## Instalação Rápida

### 1. Pré-requisitos
```bash
npm install -g firebase-tools
firebase login
```

### 2. Configure o projeto Firebase
```bash
# Em .firebaserc substitua:
"default": "SEU-PROJETO-ID"
```

### 3. Instale dependências
```bash
cd functions && npm install
```

### 4. Configure a chave Gemini
```bash
# Gere em: https://aistudio.google.com/app/apikey
firebase functions:secrets:set GEMINI_API_KEY
```

### 5. Deploy
```bash
firebase deploy
```

### 6. Setup inicial (UMA VEZ)
```bash
# Coloque service-account.json na raiz (baixe no Console Firebase)
cd scripts
npm install firebase-admin uuid
node setup.js
# Salve as API Keys exibidas!
```

**Pronto. A IA já funciona.** Sem treino adicional necessário.

---

## Endpoints

**Base URL:** `https://us-central1-SEU-PROJETO.cloudfunctions.net/api`
**Header obrigatório:** `x-api-key: SUA_CHAVE`

| Método | Endpoint       | O que faz                                     |
|--------|----------------|-----------------------------------------------|
| POST   | /read          | Lê qualquer documento e extrai dados          |
| POST   | /compare       | Compara 2 documentos e aponta divergências    |
| POST   | /calculate     | Executa cálculos sobre os dados extraídos     |
| POST   | /audit         | Pipeline completo (lê + compara + calcula)    |
| GET    | /history       | Histórico de auditorias do app                |
| POST   | /train         | Treino adicional com seus docs (opcional)     |
| POST   | /keys          | Gerencia API Keys (admin)                     |
| GET    | /health        | Status da API                                 |

---

## Uso nos Apps Android/iOS

### Android (Kotlin)
```kotlin
val body = MultipartBody.Builder()
    .setType(MultipartBody.FORM)
    .addFormDataPart("file", "nota.pdf",
        RequestBody.create("application/pdf".toMediaType(), pdfBytes))
    .build()

val request = Request.Builder()
    .url("$BASE_URL/read")
    .addHeader("x-api-key", API_KEY)
    .post(body)
    .build()

val json = JSONObject(client.newCall(request).execute().body?.string() ?: "{}")
val tipo  = json.getJSONObject("analysis").getString("documentType")
val valor = json.getJSONObject("analysis")
               .getJSONObject("financials")
               .getDouble("totalValue")
```

### iOS (Swift)
```swift
var request = URLRequest(url: URL(string: "\(baseURL)/read")!)
request.httpMethod = "POST"
request.setValue(apiKey, forHTTPHeaderField: "x-api-key")

let boundary = UUID().uuidString
request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

var body = Data()
body.append("--\(boundary)\r\n".data(using: .utf8)!)
body.append("Content-Disposition: form-data; name=\"file\"; filename=\"doc.pdf\"\r\n".data(using: .utf8)!)
body.append("Content-Type: application/pdf\r\n\r\n".data(using: .utf8)!)
body.append(pdfData)
body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
request.httpBody = body
```

---

## Resposta padrão do /read

```json
{
  "success": true,
  "auditId": "uuid",
  "analysis": {
    "documentType": "NFe",
    "summary": "Nota Fiscal de venda, R$ 6.400,00",
    "keyFields": { "numeroNF": 441, "serie": 1 },
    "entities": {
      "emitter":   { "nome": "Empresa ABC", "cnpjCpf": "12345678000190" },
      "recipient": { "nome": "XYZ Ltda",    "cnpjCpf": "98765432000110" }
    },
    "financials": {
      "totalValue": 6400.00,
      "currency":   "BRL",
      "taxes":      { "icms": 1152.00, "ipi": null, "pis": 41.60, "cofins": 192.00, "iss": null },
      "discounts":  null,
      "netValue":   6400.00
    },
    "dates": {
      "emission":   "2026-05-15",
      "due":        null,
      "competence": "2026-05"
    },
    "flags": {
      "hasSignature": false,
      "isCancelled":  false,
      "needsReview":  false
    }
  },
  "raw": {
    "tables": [...],
    "fields": { "cnpj": ["12345678000190"], "dates": ["15/05/2026"] }
  },
  "meta": {
    "format": "PDF",
    "pages": 1,
    "aiProcessed": true,
    "detectedType": "NFe",
    "knowledgeVersion": "1.0.0-builtin"
  }
}
```

---

## Opcional: Treino adicional para o SEU negócio

O `/train` só é necessário se você quiser que a IA aprenda padrões **específicos** dos seus documentos (layouts diferentes, campos customizados, regras de negócio únicas).

```bash
curl -X POST $BASE_URL/train \
  -H "x-api-key: dk_admin_SUA_CHAVE" \
  -F "files[]=@meu_documento_especifico.pdf" \
  -F "appId=app1" \
  -F "domain=multiplos" \
  -F "customRules=Minha regra específica aqui"
```
