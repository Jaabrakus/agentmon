import Foundation

@MainActor
extension AgentmonController {
    func chooseLocalModelServer(_ kind: String) {
        localModelEndpoint = kind == "lm-studio" ? "http://127.0.0.1:1234/v1" : "http://127.0.0.1:11434/v1"
        localRuntimeName = kind == "lm-studio" ? "LM Studio" : "Ollama"
        localModelConnected = false
        scanLocalModels()
    }

    func autoDetectLocalAgents() {
        guard let token = desktopToken, !token.isEmpty,
              let url = URL(string: "http://127.0.0.1:4765/v1/desktop/local-agent/discover") else {
            localModelStatus = "Turn Agentmon on first"
            return
        }
        isLocalModelBusy = true
        localModelStatus = "Scanning loopback-only local agent runtimes…"
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            Task { @MainActor in
                guard let self else { return }
                self.isLocalModelBusy = false
                if let errorMessage = object?["error"] as? String ?? error?.localizedDescription {
                    self.localModelStatus = errorMessage
                    return
                }
                let runtimes = object?["runtimes"] as? [[String: Any]] ?? []
                guard let first = runtimes.first, let baseUrl = first["baseUrl"] as? String else {
                    self.localModelStatus = "No compatible local agent runtime found · enter a custom loopback endpoint"
                    return
                }
                self.localRuntimeName = first["runtime"] as? String ?? "Local runtime"
                self.localModelEndpoint = baseUrl
                self.localModelChoices = first["models"] as? [String] ?? []
                self.selectedLocalModel = self.localModelChoices.first ?? ""
                self.localModelStatus = "Found \(runtimes.count) runtime\(runtimes.count == 1 ? "" : "s") · selected \(self.localRuntimeName)"
            }
        }.resume()
    }

    func scanLocalModels() {
        guard let token = desktopToken, !token.isEmpty else {
            localModelStatus = "Turn Agentmon on first"
            return
        }
        guard var components = URLComponents(string: "http://127.0.0.1:4765/v1/desktop/local-model/status") else { return }
        components.queryItems = [URLQueryItem(name: "baseUrl", value: localModelEndpoint)]
        guard let url = components.url else { return }
        isLocalModelBusy = true
        if localModelEndpoint.contains(":11434/") { localRuntimeName = "Ollama" }
        else if localModelEndpoint.contains(":1234/") { localRuntimeName = "LM Studio" }
        else { localRuntimeName = "Custom local runtime" }
        localModelStatus = "Scanning local server…"
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            Task { @MainActor in
                guard let self else { return }
                self.isLocalModelBusy = false
                if let errorMessage = object?["error"] as? String ?? error?.localizedDescription {
                    self.localModelConnected = false
                    self.localModelStatus = errorMessage
                    return
                }
                let models = object?["models"] as? [String] ?? []
                self.localModelChoices = models
                if !models.contains(self.selectedLocalModel) { self.selectedLocalModel = models.first ?? "" }
                self.localModelStatus = models.isEmpty ? "Server found, but no loaded models were reported" : "Found \(models.count) local model\(models.count == 1 ? "" : "s")"
            }
        }.resume()
    }

    func connectLocalModel() {
        guard let token = desktopToken, !token.isEmpty else {
            localModelStatus = "Turn Agentmon on first"
            return
        }
        guard !selectedLocalModel.isEmpty, let url = URL(string: "http://127.0.0.1:4765/v1/desktop/local-model/connect") else {
            localModelStatus = "Scan and choose a loaded model first"
            return
        }
        isLocalModelBusy = true
        localModelStatus = "Connecting locally…"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["baseUrl": localModelEndpoint, "model": selectedLocalModel])
        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            Task { @MainActor in
                guard let self else { return }
                self.isLocalModelBusy = false
                if let errorMessage = object?["error"] as? String ?? error?.localizedDescription {
                    self.localModelConnected = false
                    self.localModelStatus = errorMessage
                    return
                }
                self.localModelConnected = object?["connected"] as? Bool ?? false
                self.localModelStatus = self.localModelConnected ? "DEVICE-ONLY · \(self.selectedLocalModel) connected" : "Local model did not connect"
            }
        }.resume()
    }

    func sendLocalChat() {
        let prompt = localChatPrompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard localModelConnected, !prompt.isEmpty, let token = desktopToken,
              let url = URL(string: "http://127.0.0.1:4765/v1/desktop/local-model/chat") else { return }
        isLocalModelBusy = true
        localChatStatus("Thinking entirely on this Mac…")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["slot": "main", "prompt": prompt])
        URLSession.shared.dataTask(with: request) { [weak self] data, _, error in
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            Task { @MainActor in
                guard let self else { return }
                self.isLocalModelBusy = false
                if let errorMessage = object?["error"] as? String ?? error?.localizedDescription {
                    self.localChatResponse = "Local model error: \(errorMessage)"
                    return
                }
                self.localChatResponse = object?["answer"] as? String ?? "The local model returned no answer."
                let agentmon = object?["agentmon"] as? [String: Any]
                let procedures = agentmon?["procedures"] as? [[String: Any]] ?? []
                self.localChatAgentmon = procedures.isEmpty ? "No proven Agentmon procedure matched" : "\(agentmon?["name"] as? String ?? "Agentmon") applied \(procedures.map { $0["name"] as? String ?? "skill" }.joined(separator: ", "))"
            }
        }.resume()
    }

    private func localChatStatus(_ text: String) {
        localChatResponse = text
        localChatAgentmon = ""
    }
}
