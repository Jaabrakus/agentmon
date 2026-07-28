import AppKit
import Foundation

@MainActor
extension AgentmonController {
    func copyPairingCode() {
        guard pairingCode != "—", pairingCode != "Starting…" else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(pairingCode, forType: .string)
        statusText = "Pairing code copied"
    }

    func installChromeExtension() {
        guard let bundled = Bundle.main.resourceURL?.appendingPathComponent("browser-extension", isDirectory: true),
              FileManager.default.fileExists(atPath: bundled.appendingPathComponent("manifest.json").path) else {
            errorText = "The bundled Chrome extension is missing. Reinstall Agentmon Desktop."
            return
        }
        let destination = URL(fileURLWithPath: extensionPath, isDirectory: true)
        let parent = destination.deletingLastPathComponent()
        let staging = parent.appendingPathComponent("ChromeExtension.installing", isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: parent, withIntermediateDirectories: true)
            if FileManager.default.fileExists(atPath: staging.path) { try FileManager.default.removeItem(at: staging) }
            try FileManager.default.copyItem(at: bundled, to: staging)
            if FileManager.default.fileExists(atPath: destination.path) { try FileManager.default.removeItem(at: destination) }
            try FileManager.default.moveItem(at: staging, to: destination)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(destination.path, forType: .string)
            statusText = "Extension ready · folder path copied"
            openChromeExtensions()
            NSWorkspace.shared.activateFileViewerSelecting([destination])
        } catch {
            errorText = "Could not prepare the Chrome extension: \(error.localizedDescription)"
        }
    }

    func revealExtension() {
        let destination = URL(fileURLWithPath: extensionPath, isDirectory: true)
        if FileManager.default.fileExists(atPath: destination.path) {
            NSWorkspace.shared.activateFileViewerSelecting([destination])
        } else {
            installChromeExtension()
        }
    }

    func openChromeExtensions() {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        process.arguments = ["-a", "Google Chrome", "chrome://extensions"]
        try? process.run()
    }

    func revealSkills() {
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: projectRoot).appendingPathComponent(".agentmon/roster/main/SKILL.md")])
    }
}
