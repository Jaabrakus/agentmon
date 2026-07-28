import AppKit
import Foundation

extension AgentmonController {
    func openMarketplacePairingWebsite() {
        guard let url = URL(string: marketplaceRegistryURL) else { return }
        NSWorkspace.shared.open(url)
    }

    func pairMarketplace() {
        let token = marketplacePairToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else {
            marketplaceMessage = "Paste the one-time device token from the registry website."
            return
        }
        marketplaceRequest(path: "/v1/desktop/marketplace/pair", method: "POST", body: [
            "registryUrl": marketplaceRegistryURL,
            "token": token,
        ])
    }

    func refreshMarketplace() {
        guard isRunning, !isMarketplaceBusy else { return }
        marketplaceLastRefreshAt = Date()
        marketplaceRequest(path: "/v1/desktop/marketplace/status?slot=main", method: "GET")
    }

    func verifyMarketplaceState() {
        marketplaceRequest(path: "/v1/desktop/marketplace/attest", method: "POST", body: ["slot": "main"])
    }

    func listOnMarketplace() {
        marketplaceRequest(path: "/v1/desktop/marketplace/list", method: "POST", body: ["slot": "main", "expiresHours": 72])
    }

    func cancelMarketplaceListing() {
        marketplaceRequest(path: "/v1/desktop/marketplace/cancel", method: "POST", body: ["slot": "main"])
    }

    private func marketplaceRequest(path: String, method: String, body: [String: Any]? = nil) {
        guard isRunning, let desktopToken, !desktopToken.isEmpty,
              let url = URL(string: "http://127.0.0.1:4765\(path)") else {
            marketplaceMessage = "Turn Agentmon on before connecting to the marketplace."
            return
        }
        isMarketplaceBusy = true
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(desktopToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { request.httpBody = try? JSONSerialization.data(withJSONObject: body) }
        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let object = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            Task { @MainActor in
                guard let self else { return }
                self.isMarketplaceBusy = false
                if let error {
                    self.marketplaceMessage = "Registry unavailable: \(error.localizedDescription)"
                    return
                }
                if statusCode >= 400 {
                    self.marketplaceMessage = object?["error"] as? String ?? "Registry request failed."
                    return
                }
                guard let object else { return }
                self.applyMarketplaceSnapshot(object)
                self.marketplacePairToken = ""
            }
        }.resume()
    }

    private func applyMarketplaceSnapshot(_ object: [String: Any]) {
        marketplacePaired = object["paired"] as? Bool ?? false
        marketplaceAuthorityOnline = object["authorityOnline"] as? Bool ?? false
        marketplaceStatus = object["status"] as? String ?? "not-paired"
        if let registryURL = object["registryUrl"] as? String { marketplaceRegistryURL = registryURL }
        let local = object["local"] as? [String: Any]
        let head = object["head"] as? [String: Any]
        marketplaceStateRoot = local?["stateRoot"] as? String ?? "—"
        marketplaceHeadRoot = head?["state_root"] as? String ?? "—"
        marketplaceTransitionSequence = head?["transition_sequence"] as? Int ?? 0
        let rows = object["listings"] as? [[String: Any]] ?? []
        marketplaceListings = rows.compactMap { row in
            guard let id = row["listingId"] as? String,
                  let agentmonId = row["agentmonId"] as? String,
                  let stateRoot = row["stateRoot"] as? String else { return nil }
            return MarketplaceListing(
                id: id,
                agentmonId: agentmonId,
                species: row["species"] as? String ?? "Agentmon",
                stateRoot: stateRoot,
                expiresAt: row["expiresAt"] as? String ?? "",
                owned: row["owned"] as? Bool ?? false
            )
        }
        marketplaceOwnListingId = (object["ownListing"] as? [String: Any])?["listingId"] as? String
        if !marketplacePaired { marketplaceMessage = "Pair this device from the Agentmon Home registry." }
        else if marketplaceStatus == "verified" && marketplaceOwnListingId != nil { marketplaceMessage = "Authority verified · actively listed · credentials remain in Agentmon Home." }
        else if marketplaceStatus == "verified" { marketplaceMessage = "Authority verified and eligible to list." }
        else if marketplaceStatus == "modded" { marketplaceMessage = "Modified lineage detected. Private use is allowed; official listing is blocked." }
        else { marketplaceMessage = "Local state is not yet authority verified." }
    }
}
