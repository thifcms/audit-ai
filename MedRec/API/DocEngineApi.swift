import Foundation

/// Modelo de dados para os itens da auditoria
public struct AuditItem: Codable {
    public let auditId: String?
    public let id: String?
    public let status: String?
    public let nomePaciente: String?
    public let numeroAtendimento: String?
    public let valorCobrado: Double?
    public let valorPago: Double?
    public let diferenca: Double?

    enum CodingKeys: String, CodingKey {
        case auditId
        case id
        case status
        case nomePaciente
        case numeroAtendimento
        case valorCobrado
        case valorPago
        case diferenca
    }
}

/// Erros específicos da API DocEngine
public enum DocEngineError: Error {
    case invalidURL
    case serializationError
    case httpError(Int)
    case networkError(Error)
    case noData
}

/// Cliente da API DocEngine para integração com a plataforma MedRec.
public class DocEngineApi {
    private let baseUrl = "https://audit-ai-572028997371.us-east1.run.app"
    private let apiKey = "dk_admin_4c42b5f89cfa4988b81f07d624c16fd8"
    private let session = URLSession.shared

    public init() {}

    /// Constrói a requisição base com a API Key configurada
    private func createRequest(for endpoint: String, method: String) -> URLRequest? {
        guard let url = URL(string: "\(baseUrl)/api\(endpoint)") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        return request
    }

    /// Envia um documento para o DocEngine extrair as informações utilizando a nova arquitetura Gemini.
    /// Endpoint: /gemini/extract
    /// - Parameters:
    ///   - fileUrl: URL local do arquivo a ser processado
    ///   - completion: Callback com o resultado da extração
    public func readDocument(fileUrl: URL, completion: @escaping (Result<[String: Any], DocEngineError>) -> Void) {
        guard var request = createRequest(for: "/gemini/extract", method: "POST") else {
            completion(.failure(.invalidURL))
            return
        }

        guard let fileData = try? Data(contentsOf: fileUrl) else {
            completion(.failure(.noData))
            return
        }

        let base64String = fileData.base64EncodedString()
        let filename = fileUrl.lastPathComponent
        
        let ext = fileUrl.pathExtension.lowercased()
        let mimeType = ext == "pdf" ? "application/pdf" : "image/jpeg"

        let payload: [String: Any] = [
            "fileBase64": base64String,
            "filename": filename,
            "mimeType": mimeType,
            "expectedType": "etiqueta_hospitalar",
            "modelStrategy": "rotation"
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        } catch {
            completion(.failure(.serializationError))
            return
        }

        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(.networkError(error)))
                return
            }

            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                completion(.failure(.httpError(httpResponse.statusCode)))
                return
            }

            guard let data = data else {
                completion(.failure(.noData))
                return
            }

            do {
                if var json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
                    // Achata o JSON se os dados estiverem aninhados em 'data'
                    if let nestedData = json["data"] as? [String: Any] {
                        for (key, value) in nestedData {
                            json[key] = value
                        }
                    }
                    completion(.success(json))
                } else {
                    completion(.failure(.serializationError))
                }
            } catch {
                completion(.failure(.serializationError))
            }
        }
        task.resume()
    }

    /// Reconcilia a lista de pacientes do faturamento com o relatório de repasse do hospital.
    /// Endpoint: /reconcile
    /// - Parameters:
    ///   - faturamentoId: ID do arquivo de faturamento já processado.
    ///   - repasseId: ID do arquivo de repasse já processado.
    ///   - completion: Callback com lista de AuditItem contendo o resultado da reconciliação.
    public func reconcile(faturamentoId: String, repasseId: String, completion: @escaping (Result<[AuditItem], DocEngineError>) -> Void) {
        guard var request = createRequest(for: "/reconcile", method: "POST") else {
            completion(.failure(.invalidURL))
            return
        }

        request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        let parameters = ["faturamentoId": faturamentoId, "repasseId": repasseId]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: parameters, options: [])
        } catch {
            completion(.failure(.serializationError))
            return
        }

        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(.networkError(error)))
                return
            }

            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                completion(.failure(.httpError(httpResponse.statusCode)))
                return
            }

            guard let data = data else {
                completion(.failure(.noData))
                return
            }

            do {
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                   let resultsDict = json["allResults"] {
                    
                    let resultsData = try JSONSerialization.data(withJSONObject: resultsDict, options: [])
                    let items = try JSONDecoder().decode([AuditItem].self, from: resultsData)
                    completion(.success(items))
                } else {
                    completion(.failure(.serializationError))
                }
            } catch {
                completion(.failure(.serializationError))
            }
        }
        task.resume()
    }

    /// Busca o histórico de todas auditorias passadas geradas pelo sistema.
    /// Endpoint: /history
    /// - Parameter completion: Callback com lista de AuditItem do histórico.
    public func getHistory(completion: @escaping (Result<[AuditItem], DocEngineError>) -> Void) {
        guard let request = createRequest(for: "/history", method: "GET") else {
            completion(.failure(.invalidURL))
            return
        }

        let task = session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(.networkError(error)))
                return
            }

            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                completion(.failure(.httpError(httpResponse.statusCode)))
                return
            }

            guard let data = data else {
                completion(.failure(.noData))
                return
            }

            do {
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                   let historyDict = json["audits"] {
                    
                    let historyData = try JSONSerialization.data(withJSONObject: historyDict, options: [])
                    let items = try JSONDecoder().decode([AuditItem].self, from: historyData)
                    completion(.success(items))
                } else {
                    completion(.failure(.serializationError))
                }
            } catch {
                completion(.failure(.serializationError))
            }
        }
        task.resume()
    }
}
