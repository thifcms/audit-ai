import Foundation

/// Modelo de dados para os itens da auditoria
public struct AuditItem: Codable {
    public let auditId: String
    public let status: String
    public let nomePaciente: String
    public let numeroAtendimento: String
    public let valorCobrado: Double
    public let valorPago: Double
    public let diferenca: Double
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
    private let baseUrl = "https://us-central1-spherical-leaf-vr5vm.cloudfunctions.net/api"
    private let apiKey = "dk_app_398621514c374c1bbaee5c20d65f2a83"
    private let session = URLSession.shared

    public init() {}

    /// Constrói a requisição base com a API Key configurada
    private func createRequest(for endpoint: String, method: String) -> URLRequest? {
        guard let url = URL(string: "\(baseUrl)\(endpoint)") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue(apiKey, forHTTPHeaderField: "x-api-key")
        return request
    }

    /// Envia um documento para o DocEngine extrair as informações.
    /// Endpoint: /read
    /// - Parameters:
    ///   - fileUrl: URL local do arquivo a ser processado
    ///   - completion: Callback com o resultado da extração
    public func readDocument(fileUrl: URL, completion: @escaping (Result<[String: Any], DocEngineError>) -> Void) {
        guard var request = createRequest(for: "/read", method: "POST") else {
            completion(.failure(.invalidURL))
            return
        }

        let boundary = "Boundary-\(UUID().uuidString)"
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        let filename = fileUrl.lastPathComponent
        guard let fileData = try? Data(contentsOf: fileUrl) else {
            completion(.failure(.noData))
            return
        }

        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: application/octet-stream\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)

        request.httpBody = body

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
                if let json = try JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] {
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
                   let resultsDict = json["results"] {
                    
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
                   let historyDict = json["history"] {
                    
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
