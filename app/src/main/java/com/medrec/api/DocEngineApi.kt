package com.medrec.api

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody

/**
 * Modelo de dados para os itens da auditoria
 */
data class AuditItem(
    val auditId: String,
    val status: String,
    val nomePaciente: String,
    val numeroAtendimento: String,
    val valorCobrado: Double,
    val valorPago: Double,
    val diferenca: Double
)

/**
 * Cliente da API DocEngine para integração com a plataforma MedRec.
 */
class DocEngineApi {

    private val baseUrl = "https://us-central1-spherical-leaf-vr5vm.cloudfunctions.net/api"
    private val apiKey = "dk_app_398621514c374c1bbaee5c20d65f2a83"
    private val client = OkHttpClient()

    /**
     * Envia um documento (PDF, Imagem, Excel) para o DocEngine extrair as informações.
     * Endpoint: /read
     * 
     * @param file Arquivo a ser processado.
     * @return JSONObject contendo o resultado da extração.
     */
    suspend fun readDocument(file: File): Result<JSONObject> = withContext(Dispatchers.IO) {
        try {
            val mediaType = "application/octet-stream".toMediaTypeOrNull()
            val requestBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, file.asRequestBody(mediaType))
                .build()

            val request = Request.Builder()
                .url("$baseUrl/read")
                .addHeader("x-api-key", apiKey)
                .post(requestBody)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Erro na extração: HTTP ${response.code}"))
                }
                val responseData = response.body?.string() ?: "{}"
                Result.success(JSONObject(responseData))
            }
        } catch (e: Exception) {
            // Tratamento de erro na requisição de leitura do documento
            Result.failure(e)
        }
    }

    /**
     * Reconcilia a lista de pacientes do faturamento com o relatório de repasse do hospital.
     * Endpoint: /reconcile
     * 
     * @param faturamentoId ID do arquivo de faturamento já processado.
     * @param repasseId ID do arquivo de repasse já processado.
     * @return Lista de AuditItem com o resultado da reconciliação.
     */
    suspend fun reconcile(faturamentoId: String, repasseId: String): Result<List<AuditItem>> = withContext(Dispatchers.IO) {
        try {
            val jsonBody = JSONObject().apply {
                put("faturamentoId", faturamentoId)
                put("repasseId", repasseId)
            }

            val requestBody = jsonBody.toString().toRequestBody("application/json".toMediaTypeOrNull())

            val request = Request.Builder()
                .url("$baseUrl/reconcile")
                .addHeader("x-api-key", apiKey)
                .post(requestBody)
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Erro na reconciliação: HTTP ${response.code}"))
                }
                
                val responseData = response.body?.string() ?: "{}"
                val jsonResponse = JSONObject(responseData)
                val resultsArray = jsonResponse.optJSONArray("results") ?: org.json.JSONArray()
                
                val auditItems = mutableListOf<AuditItem>()
                for (i in 0 until resultsArray.length()) {
                    val jObj = resultsArray.getJSONObject(i)
                    auditItems.add(
                        AuditItem(
                            auditId = jObj.optString("auditId"),
                            status = jObj.optString("status"),
                            nomePaciente = jObj.optString("nomePaciente"),
                            numeroAtendimento = jObj.optString("numeroAtendimento"),
                            valorCobrado = jObj.optDouble("valorCobrado", 0.0),
                            valorPago = jObj.optDouble("valorPago", 0.0),
                            diferenca = jObj.optDouble("diferenca", 0.0)
                        )
                    )
                }
                
                Result.success(auditItems)
            }
        } catch (e: Exception) {
            // Tratamento de erro para a falha na reconciliação
            Result.failure(e)
        }
    }

    /**
     * Busca o histórico de todas auditorias passadas geradas pelo sistema.
     * Endpoint: /history
     * 
     * @return Lista de AuditItem do histórico.
     */
    suspend fun getHistory(): Result<List<AuditItem>> = withContext(Dispatchers.IO) {
        try {
            val request = Request.Builder()
                .url("$baseUrl/history")
                .addHeader("x-api-key", apiKey)
                .get()
                .build()

            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    return@withContext Result.failure(Exception("Erro na busca do histórico: HTTP ${response.code}"))
                }
                
                val responseData = response.body?.string() ?: "{}"
                val jsonResponse = JSONObject(responseData)
                val resultsArray = jsonResponse.optJSONArray("history") ?: org.json.JSONArray()
                
                val auditItems = mutableListOf<AuditItem>()
                for (i in 0 until resultsArray.length()) {
                    val jObj = resultsArray.getJSONObject(i)
                    auditItems.add(
                        AuditItem(
                            auditId = jObj.optString("auditId"),
                            status = jObj.optString("status"),
                            nomePaciente = jObj.optString("nomePaciente"),
                            numeroAtendimento = jObj.optString("numeroAtendimento"),
                            valorCobrado = jObj.optDouble("valorCobrado", 0.0),
                            valorPago = jObj.optDouble("valorPago", 0.0),
                            diferenca = jObj.optDouble("diferenca", 0.0)
                        )
                    )
                }
                
                Result.success(auditItems)
            }
        } catch (e: Exception) {
            // Tratamento de erro na requisição do histórico
            Result.failure(e)
        }
    }
}
