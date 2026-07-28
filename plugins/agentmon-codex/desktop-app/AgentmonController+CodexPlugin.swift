import Foundation

private struct CodexPluginInstallResult: Sendable {
    let installed: Bool
    let connected: Bool
    let message: String
}

@MainActor
extension AgentmonController {
    func inspectCodexPluginInstallation() {
        guard !isInstallingCodexPlugin, let codex = Self.findCodexExecutable() else { return }
        Task {
            let inspection = await Task.detached(priority: .utility) {
                Self.run(codex, ["plugin", "list"])
            }.value
            guard inspection.0 == 0 else { return }
            let installed = inspection.1.contains("agentmon-codex@agentmon-local")
                && inspection.1.contains("installed")
            codexPluginInstalled = installed
            codexPluginStatus = installed
                ? "Installed · activate it in a new Codex chat"
                : "Ready to install"
        }
    }

    func installCodexPlugin() {
        guard !isInstallingCodexPlugin else { return }
        guard let root = codexPluginRoot() else {
            errorText = "Choose the Agentmon project containing .agents/plugins/marketplace.json."
            codexPluginStatus = "Agentmon marketplace not found"
            return
        }
        guard let codex = Self.findCodexExecutable() else {
            errorText = "Codex CLI was not found. Open the ChatGPT/Codex app once, then try again."
            codexPluginStatus = "Codex CLI not found"
            return
        }

        errorText = nil
        isInstallingCodexPlugin = true
        codexPluginStatus = "Installing locally…"

        Task {
            let result = await Task.detached(priority: .userInitiated) {
                Self.performCodexPluginInstall(root: root, codex: codex)
            }.value
            isInstallingCodexPlugin = false
            codexPluginInstalled = result.installed
            codexPluginStatus = result.message
            if result.installed {
                statusText = result.connected
                    ? "Codex plugin installed · Agentmon connected"
                    : "Codex plugin installed · hatch an Agentmon to connect"
            } else {
                errorText = result.message
            }
        }
    }

    private func codexPluginRoot() -> String? {
        let selected = URL(fileURLWithPath: projectRoot, isDirectory: true)
        let bundledBesideProject = Bundle.main.bundleURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        for candidate in [selected, bundledBesideProject] {
            let marketplace = candidate.appendingPathComponent(".agents/plugins/marketplace.json").path
            let plugin = candidate.appendingPathComponent("plugins/agentmon-codex/.codex-plugin/plugin.json").path
            if FileManager.default.fileExists(atPath: marketplace),
               FileManager.default.fileExists(atPath: plugin) {
                return candidate.path
            }
        }
        return nil
    }

    nonisolated private static func findCodexExecutable() -> String? {
        var candidates = [
            "/Applications/ChatGPT.app/Contents/Resources/codex",
            "/usr/local/bin/codex",
            "/opt/homebrew/bin/codex",
        ]
        if let path = ProcessInfo.processInfo.environment["PATH"] {
            candidates.append(contentsOf: path.split(separator: ":").map { "\($0)/codex" })
        }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    nonisolated private static func run(_ executable: String, _ arguments: [String], cwd: String? = nil) -> (Int32, String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        if let cwd { process.currentDirectoryURL = URL(fileURLWithPath: cwd, isDirectory: true) }
        let output = Pipe()
        process.standardOutput = output
        process.standardError = output
        do {
            try process.run()
            process.waitUntilExit()
            let data = output.fileHandleForReading.readDataToEndOfFile()
            return (process.terminationStatus, String(data: data, encoding: .utf8) ?? "")
        } catch {
            return (1, error.localizedDescription)
        }
    }

    nonisolated private static func performCodexPluginInstall(root: String, codex: String) -> CodexPluginInstallResult {
        let marketplace = run(codex, ["plugin", "marketplace", "list", "--json"])
        guard marketplace.0 == 0 else {
            return CodexPluginInstallResult(installed: false, connected: false, message: "Could not inspect Codex marketplaces: \(marketplace.1.trimmingCharacters(in: .whitespacesAndNewlines))")
        }
        if !marketplace.1.contains(root) {
            let registration = run(codex, ["plugin", "marketplace", "add", root, "--json"])
            guard registration.0 == 0 else {
                return CodexPluginInstallResult(installed: false, connected: false, message: "Could not register Agentmon: \(registration.1.trimmingCharacters(in: .whitespacesAndNewlines))")
            }
        }

        let installation = run(codex, ["plugin", "add", "agentmon-codex@agentmon-local", "--json"])
        guard installation.0 == 0 else {
            return CodexPluginInstallResult(installed: false, connected: false, message: "Could not install Agentmon: \(installation.1.trimmingCharacters(in: .whitespacesAndNewlines))")
        }

        let roster = URL(fileURLWithPath: root).appendingPathComponent(".agentmon/roster/main/agentmon.json").path
        guard FileManager.default.fileExists(atPath: roster) else {
            return CodexPluginInstallResult(installed: true, connected: false, message: "Installed · hatch an Agentmon, then start a new Codex chat")
        }

        let script = URL(fileURLWithPath: root).appendingPathComponent("plugins/agentmon-codex/scripts/agentmon.mjs").path
        let node = ["/usr/local/bin/node", "/opt/homebrew/bin/node", "/usr/bin/node"].first { FileManager.default.isExecutableFile(atPath: $0) }
        guard FileManager.default.fileExists(atPath: script), let node else {
            return CodexPluginInstallResult(installed: true, connected: false, message: "Installed · runtime pack needs a manual refresh")
        }
        let deployment = run(node, [script, "deploy", "--slot", "main"], cwd: root)
        guard deployment.0 == 0 else {
            return CodexPluginInstallResult(installed: true, connected: false, message: "Installed · runtime pack refresh failed")
        }
        return CodexPluginInstallResult(installed: true, connected: true, message: "Installed and connected · start a new Codex chat")
    }
}
