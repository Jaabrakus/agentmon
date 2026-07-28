import AppKit
import Foundation
import SwiftUI

private struct LocalAgentmonSnapshot: Sendable {
    let legacyFeedDetected: Bool
    let creatureName: String
    let readiness: Int
    let skillCount: Int
    let procedureCount: Int
    let promptSamples: Int
    let promptConfidence: Int
    let testedProcedures: Int
    let provenProcedures: Int
    let outcomeCount: Int
    let effectivenessScore: Int
    let beneficialProcedures: Int
    let regressedProcedures: Int
    let evolutionForm: String
    let lineageGeneration: Int
    let nextEvolution: String
    let trainedAt: String
    let lifecycleStage: String
    let signalBrightness: Int
    let pixelSnapStrength: Int
    let imageData: Data?
}

struct MarketplaceListing: Identifiable, Sendable {
    let id: String
    let agentmonId: String
    let species: String
    let stateRoot: String
    let expiresAt: String
    let owned: Bool
}

@MainActor
final class AgentmonController: ObservableObject {
    static let shared = AgentmonController()

    @Published var projectRoot: String
    @Published var isRunning = false
    @Published var statusText = "Ready to awaken"
    @Published var pairingCode = "—"
    @Published var browserPaired = false
    @Published var browserOrigin = "Not connected"
    @Published var browserSite = "No LLM site enabled"
    @Published var browserSiteEnabled = false
    @Published var browserSites: [String] = []
    @Published var actionLearningSites: [String] = []
    @Published var actionResonance = "UNBOUND"
    @Published var actionObservedEvents = 0
    @Published var actionProposals = 0
    @Published var actionApproved = 0
    @Published var actionBattleState = "NEUTRAL"
    @Published var actionBattleIntensity = 0
    @Published var browserPromptCount = 0
    @Published var browserLastPrompt = "No prompts observed"
    @Published var browserDownlink = "No Agentmon active"
    @Published var codexPluginStatus = "Ready to install"
    @Published var codexPluginInstalled = false
    @Published var isInstallingCodexPlugin = false
    @Published var localModelEndpoint = "http://127.0.0.1:11434/v1"
    @Published var localModelChoices: [String] = []
    @Published var selectedLocalModel = ""
    @Published var localRuntimeName = "Custom local runtime"
    @Published var localModelConnected = false
    @Published var localModelStatus = "Turn Agentmon on, then scan Ollama or LM Studio"
    @Published var localChatPrompt = ""
    @Published var localChatResponse = ""
    @Published var localChatAgentmon = ""
    @Published var isLocalModelBusy = false
    @Published var creatureName = "UNBOUND EGG"
    @Published var readiness = 0
    @Published var lifecycleStage = "signal"
    @Published var signalBrightness = 8
    @Published var skillCount = 0
    @Published var procedureCount = 0
    @Published var promptSamples = 0
    @Published var promptConfidence = 0
    @Published var testedProcedures = 0
    @Published var provenProcedures = 0
    @Published var outcomeCount = 0
    @Published var effectivenessScore = 0
    @Published var beneficialProcedures = 0
    @Published var regressedProcedures = 0
    @Published var evolutionForm = "UNBOUND"
    @Published var lineageGeneration = 0
    @Published var nextEvolution = "Bind a species egg"
    @Published var pixelSnapStrength = 4.0
    @Published var pixelSnapStatus = "Live preview level 4 · catalog unchanged"
    @Published var isApplyingPixelSnap = false
    @Published var pixelSnapProgress = 0.0
    @Published var displayImage: NSImage?
    @Published var legacyFeedDetected = false
    @Published var errorText: String?
    @Published var marketplaceRegistryURL = "https://agentmon-lab.tangstacks.chatgpt.site"
    @Published var marketplacePairToken = ""
    @Published var marketplacePaired = false
    @Published var marketplaceAuthorityOnline = false
    @Published var marketplaceStatus = "not-paired"
    @Published var marketplaceStateRoot = "—"
    @Published var marketplaceHeadRoot = "—"
    @Published var marketplaceTransitionSequence = 0
    @Published var marketplaceListings: [MarketplaceListing] = []
    @Published var marketplaceOwnListingId: String?
    @Published var marketplaceMessage = "Pair this device from the Agentmon Home registry."
    @Published var isMarketplaceBusy = false

    private var companion: Process?
    private var timer: Timer?
    private var outputBuffer = ""
    private var lastRenderedTraining = ""
    private var rendering = false
    private var inspecting = false
    var visualBuilder: Process?
    var pixelSnapWatchdog: Timer?
    var pixelSnapLastProgressAt = Date()
    var pixelSnapOutputBuffer = ""
    var pixelSnapCancellationReason: String?
    var pixelSnapPreviewTouched = false
    var sourceDisplayImage: NSImage?
    var desktopToken: String?
    var marketplaceLastRefreshAt = Date.distantPast

    private init() {
        let saved = UserDefaults.standard.string(forKey: "AgentmonProjectRoot")
        projectRoot = saved ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Documents/PokemonLLM").path
        if let eggURL = Bundle.main.resourceURL?.appendingPathComponent("agentmon-premium-egg.png") {
            sourceDisplayImage = NSImage(contentsOf: eggURL)
            displayImage = sourceDisplayImage
        }
    }

    var extensionPath: String {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return support.appendingPathComponent("Agentmon/ChromeExtension", isDirectory: true).path
    }
    private var statePath: String { URL(fileURLWithPath: projectRoot).appendingPathComponent(".agentmon/roster/main/agentmon.json").path }

    func chooseProject() {
        let panel = NSOpenPanel()
        panel.title = "Choose the PokemonLLM project"
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK, let url = panel.url {
            projectRoot = url.path
            UserDefaults.standard.set(projectRoot, forKey: "AgentmonProjectRoot")
            inspectLocalState()
        }
    }

    func togglePower() { isRunning ? stop() : start() }

    func start() {
        guard companion == nil else { return }
        let script = Bundle.main.resourceURL?.appendingPathComponent("agentmon-desktop-companion.mjs").path ?? ""
        guard FileManager.default.fileExists(atPath: script) else {
            errorText = "Choose a PokemonLLM project containing the Agentmon plugin."
            return
        }
        guard let node = findNode() else {
            errorText = "Node.js was not found in /usr/local/bin or /opt/homebrew/bin."
            return
        }

        errorText = nil
        pairingCode = "Starting…"
        browserPaired = false
        browserOrigin = "Waiting for extension"
        statusText = "Starting local companion"
        outputBuffer = ""

        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = ["--disable-warning=ExperimentalWarning", script, "--cwd", projectRoot, "--slot", "main", "--port", "4765"]
        let standardOutput = Pipe()
        let standardError = Pipe()
        process.standardOutput = standardOutput
        process.standardError = standardError
        standardOutput.fileHandleForReading.readabilityHandler = outputHandler
        standardError.fileHandleForReading.readabilityHandler = outputHandler
        process.terminationHandler = { process in
            Task { @MainActor [weak self] in self?.didTerminate(process) }
        }

        do {
            try process.run()
            companion = process
            isRunning = true
            timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
                Task { @MainActor [weak self] in self?.poll() }
            }
            poll()
        } catch {
            errorText = error.localizedDescription
            statusText = "Could not start"
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        companion?.terminate()
        companion = nil
        isRunning = false
        browserPaired = false
        browserOrigin = "Not connected"
        browserSite = "No LLM site enabled"
        browserSiteEnabled = false
        browserSites = []
        actionLearningSites = []
        actionResonance = "UNBOUND"
        actionObservedEvents = 0
        actionProposals = 0
        actionApproved = 0
        actionBattleState = "NEUTRAL"
        actionBattleIntensity = 0
        browserPromptCount = 0
        browserLastPrompt = "No prompts observed"
        browserDownlink = "No Agentmon active"
        desktopToken = nil
        pairingCode = "—"
        statusText = "Companion is off"
        localModelConnected = false
        localModelStatus = "Turn Agentmon on, then scan Ollama or LM Studio"
    }

    func shutdown() { stop() }

    func inspectLocalState() {
        guard !inspecting else { return }
        inspecting = true
        let root = projectRoot
        Task {
            let snapshot = await Task.detached(priority: .utility) { Self.readLocalSnapshot(root: root) }.value
            inspecting = false
            legacyFeedDetected = snapshot.legacyFeedDetected
            creatureName = snapshot.creatureName
            readiness = snapshot.readiness
            skillCount = snapshot.skillCount
            procedureCount = snapshot.procedureCount
            promptSamples = snapshot.promptSamples
            promptConfidence = snapshot.promptConfidence
            testedProcedures = snapshot.testedProcedures
            provenProcedures = snapshot.provenProcedures
            outcomeCount = snapshot.outcomeCount
            effectivenessScore = snapshot.effectivenessScore
            beneficialProcedures = snapshot.beneficialProcedures
            regressedProcedures = snapshot.regressedProcedures
            evolutionForm = snapshot.evolutionForm
            lineageGeneration = snapshot.lineageGeneration
            nextEvolution = snapshot.nextEvolution
            lifecycleStage = snapshot.lifecycleStage
            signalBrightness = snapshot.signalBrightness
            if !pixelSnapPreviewTouched && !isApplyingPixelSnap {
                pixelSnapStrength = Double(snapshot.pixelSnapStrength)
                pixelSnapStatus = "Catalog level \(snapshot.pixelSnapStrength) · drag for a live preview"
            }
            if let data = snapshot.imageData, let image = NSImage(data: data) {
                sourceDisplayImage = image
                refreshPixelSnapPreview()
            }
            if snapshot.trainedAt != lastRenderedTraining { renderVisual(trainedAt: snapshot.trainedAt) }
        }
    }

    private var outputHandler: @Sendable (FileHandle) -> Void {
        { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            Task { @MainActor in self?.consumeOutput(text) }
        }
    }

    private func didTerminate(_ process: Process) {
        guard companion === process else { return }
        companion = nil
        isRunning = false
        timer?.invalidate()
        timer = nil
        pairingCode = "—"
        browserPaired = false
        browserOrigin = "Not connected"
        browserSite = "No LLM site enabled"
        browserSiteEnabled = false
        browserSites = []
        browserPromptCount = 0
        browserLastPrompt = "No prompts observed"
        browserDownlink = "No Agentmon active"
        desktopToken = nil
        if process.terminationStatus != 0 { errorText = errorText ?? "The companion stopped. Port 4765 may already be in use." }
        statusText = "Companion is off"
    }

    private func consumeOutput(_ text: String) {
        outputBuffer += text
        let lines = outputBuffer.components(separatedBy: .newlines)
        outputBuffer = lines.last ?? ""
        for line in lines.dropLast() {
            if line.hasPrefix("Browser pairing code: ") {
                pairingCode = String(line.dropFirst("Browser pairing code: ".count))
                statusText = "Companion on · pair the extension"
            } else if line.hasPrefix("Desktop token: ") {
                desktopToken = String(line.dropFirst("Desktop token: ".count))
                scanLocalModels()
                refreshMarketplace()
            } else if line.localizedCaseInsensitiveContains("failed") {
                errorText = line
            }
        }
    }

    private func poll() {
        inspectLocalState()
        if isRunning {
            pollDaemonStatus()
            if Date().timeIntervalSince(marketplaceLastRefreshAt) > 20 { refreshMarketplace() }
        }
    }

    private func pollDaemonStatus() {
        guard let token = desktopToken, !token.isEmpty,
              let url = URL(string: "http://127.0.0.1:4765/v1/desktop/status?slot=main") else { return }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let data, let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            let browser = object["browser"] as? [String: Any]
            let effectiveness = object["effectiveness"] as? [String: Any]
            let actionLearning = object["actionLearning"] as? [String: Any]
            Task { @MainActor in
                self?.browserPaired = browser?["paired"] as? Bool ?? false
                self?.browserOrigin = self?.browserPaired == true ? "EXTENSION CONNECTED" : "Waiting for extension"
                self?.browserSite = browser?["site"] as? String ?? "No LLM site enabled"
                self?.browserSiteEnabled = browser?["siteEnabled"] as? Bool ?? false
                self?.browserPromptCount = browser?["promptCount"] as? Int ?? 0
                self?.browserLastPrompt = browser?["lastPromptAt"] as? String ?? "No prompts observed"
                let siteRows = browser?["sites"] as? [[String: Any]] ?? []
                self?.browserSites = siteRows.filter { $0["enabled"] as? Bool == true }.compactMap { $0["site"] as? String }
                self?.actionLearningSites = siteRows.filter { $0["actionLearningEnabled"] as? Bool == true }.compactMap { $0["site"] as? String }
                self?.actionResonance = (actionLearning?["resonance"] as? String ?? "UNBOUND").uppercased()
                self?.actionObservedEvents = actionLearning?["observedEvents"] as? Int ?? 0
                self?.actionProposals = actionLearning?["proposed"] as? Int ?? 0
                self?.actionApproved = actionLearning?["approved"] as? Int ?? 0
                let trainerState = actionLearning?["trainerState"] as? [String: Any]
                self?.actionBattleState = (trainerState?["state"] as? String ?? "neutral").uppercased()
                self?.actionBattleIntensity = trainerState?["intensity"] as? Int ?? 0
                let active = browser?["activeAgentmon"] as? [String: Any]
                self?.browserDownlink = active?["name"] as? String ?? "No Agentmon active"
                self?.outcomeCount = effectiveness?["totalOutcomes"] as? Int ?? self?.outcomeCount ?? 0
                self?.effectivenessScore = effectiveness?["averageScore"] as? Int ?? self?.effectivenessScore ?? 0
                self?.beneficialProcedures = effectiveness?["beneficialProcedures"] as? Int ?? self?.beneficialProcedures ?? 0
                self?.regressedProcedures = effectiveness?["regressedProcedures"] as? Int ?? self?.regressedProcedures ?? 0
                if self?.browserPaired == true { self?.statusText = "Agentmon is learning locally" }
            }
        }.resume()
    }

    func renderVisual(trainedAt: String) {
        guard !rendering, !trainedAt.isEmpty, let node = findNode() else { return }
        let script = URL(fileURLWithPath: projectRoot).appendingPathComponent("plugins/agentmon-codex/scripts/agentmon-visual.mjs").path
        guard FileManager.default.fileExists(atPath: script) else { return }
        rendering = true
        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [script, "--cwd", projectRoot, "--slot", "main"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        process.terminationHandler = { _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.rendering = false
                self.lastRenderedTraining = trainedAt
                if self.lifecycleStage != "signal" {
                    let file = self.lifecycleStage == "egg" ? "egg.png" : "creature.png"
                    self.loadImage(path: URL(fileURLWithPath: self.projectRoot).appendingPathComponent(".agentmon/roster/main/visual/\(file)").path)
                }
            }
        }
        try? process.run()
    }

    func loadImage(path: String) {
        if let image = NSImage(contentsOfFile: path) {
            sourceDisplayImage = image
            refreshPixelSnapPreview()
        }
    }

    func findNode() -> String? {
        ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"].first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    nonisolated private static func readLocalSnapshot(root: String) -> LocalAgentmonSnapshot {
        let rootURL = URL(fileURLWithPath: root)
        let legacy = rootURL.appendingPathComponent(".agentmon/feeds/main.json").path
        let state = rootURL.appendingPathComponent(".agentmon/roster/main/agentmon.json")
        guard let data = try? Data(contentsOf: state),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return LocalAgentmonSnapshot(legacyFeedDetected: FileManager.default.fileExists(atPath: legacy), creatureName: "UNBOUND SIGNAL", readiness: 0, skillCount: 0, procedureCount: 0, promptSamples: 0, promptConfidence: 0, testedProcedures: 0, provenProcedures: 0, outcomeCount: 0, effectivenessScore: 0, beneficialProcedures: 0, regressedProcedures: 0, evolutionForm: "UNBOUND", lineageGeneration: 0, nextEvolution: "Bind a species egg", trainedAt: "", lifecycleStage: "signal", signalBrightness: 8, pixelSnapStrength: 4, imageData: nil)
        }
        let hatch = object["hatchReadiness"] as? [String: Any]
        let score = hatch?["score"] as? Int ?? (hatch == nil ? 100 : 0)
        let stage = score < 60 ? "signal" : (score < 100 ? "egg" : "hatched")
        let planURL = rootURL.appendingPathComponent(".agentmon/roster/main/visual/curated-plan.json")
        let planObject = (try? Data(contentsOf: planURL)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let visualSpecies = (planObject?["species"] as? [String: Any])?["name"] as? String
        let evolution = planObject?["evolution"] as? [String: Any]
        let formOrder = evolution?["order"] as? Int ?? (planObject == nil ? 0 : 2)
        let formLabel = evolution?["label"] as? String ?? (planObject == nil ? "UNBOUND" : "Form II")
        let lineage = object["lineage"] as? [String: Any]
        let generation = lineage?["generation"] as? Int ?? 1
        let nextEvolution = formOrder == 0 ? "Bind a species egg" : (formOrder >= 3 ? "Final authored form reached" : "Form \(formOrder + 1) · permanent DNA event required")
        let identityName = (object["form"] as? String) ?? (object["species"] as? String) ?? "AGENTMON"
        let name = stage == "signal" ? "UNBOUND SIGNAL" : (stage == "egg" ? "\(visualSpecies ?? "BOUND") EGG" : identityName)
        let visualFile = stage == "egg" ? "egg.png" : "creature.png"
        let visual = rootURL.appendingPathComponent(".agentmon/roster/main/visual/\(visualFile)")
        let imageData = stage == "signal" ? nil : try? Data(contentsOf: visual)
        let visualManifest = rootURL.appendingPathComponent("plugins/agentmon-codex/assets/visual-v4/manifest.json")
        let manifestObject = (try? Data(contentsOf: visualManifest)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let snapStrength = (manifestObject?["pixelSnapper"] as? [String: Any])?["strength"] as? Int ?? 4
        let skills = object["learnedSkills"] as? [[String: Any]]
        let procedures = object["proceduralSkills"] as? [[String: Any]]
        let promptprint = object["promptprint"] as? [String: Any]
        let arena = object["arenaReport"] as? [String: Any]
        let effectiveness = object["effectivenessReport"] as? [String: Any]
        return LocalAgentmonSnapshot(
            legacyFeedDetected: FileManager.default.fileExists(atPath: legacy),
            creatureName: name,
            readiness: score,
            skillCount: skills?.count ?? 0,
            procedureCount: procedures?.count ?? 0,
            promptSamples: promptprint?["sampleCount"] as? Int ?? 0,
            promptConfidence: promptprint?["confidence"] as? Int ?? 0,
            testedProcedures: arena?["testedProcedures"] as? Int ?? 0,
            provenProcedures: arena?["provenProcedures"] as? Int ?? 0,
            outcomeCount: effectiveness?["totalOutcomes"] as? Int ?? 0,
            effectivenessScore: effectiveness?["averageScore"] as? Int ?? 0,
            beneficialProcedures: effectiveness?["beneficialProcedures"] as? Int ?? 0,
            regressedProcedures: effectiveness?["regressedProcedures"] as? Int ?? 0,
            evolutionForm: formLabel.uppercased(),
            lineageGeneration: generation,
            nextEvolution: nextEvolution,
            trainedAt: object["trainedAt"] as? String ?? "",
            lifecycleStage: stage,
            signalBrightness: stage == "signal" ? max(8, score) : 100,
            pixelSnapStrength: snapStrength,
            imageData: imageData
        )
    }
}
