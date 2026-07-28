import Foundation
import SwiftUI

struct StatusPill: View {
    let text: String
    let active: Bool

    var body: some View {
        HStack(spacing: 6) {
            Circle().fill(active ? Color.mint : Color.gray).frame(width: 7, height: 7)
            Text(text.uppercased()).font(.system(size: 10, weight: .bold, design: .monospaced))
        }
        .padding(.horizontal, 10).padding(.vertical, 6)
        .background(Color.white.opacity(0.06)).clipShape(Capsule())
    }
}

struct PixelLeafView: View {
    let direction: CGFloat

    var body: some View {
        ZStack {
            Rectangle().fill(Color(red: 0.20, green: 0.55, blue: 0.43)).frame(width: 17, height: 8)
            Rectangle().fill(Color.mint).frame(width: 10, height: 6).offset(x: direction * 4, y: -4)
            Rectangle().fill(Color(red: 0.72, green: 0.97, blue: 0.72)).frame(width: 5, height: 4).offset(x: direction * 7, y: -7)
        }
        .rotationEffect(.degrees(direction < 0 ? -28 : 28))
        .shadow(color: .mint.opacity(0.45), radius: 4)
    }
}

struct SignalLightView: View {
    let brightness: Int
    @State private var pulsing = false

    private func vineX(_ fraction: Double) -> CGFloat {
        CGFloat(sin(fraction * Double.pi * 2.35)) * 22
    }

    private func vineY(_ fraction: Double) -> CGFloat {
        78 - CGFloat(fraction) * 148
    }

    var body: some View {
        let growth = max(0.06, min(1.0, Double(brightness) / 100.0))
        let leaves: [(Double, CGFloat)] = [(0.18, -1), (0.31, 1), (0.46, -1), (0.61, 1), (0.75, -1), (0.88, 1)]
        ZStack {
            Circle()
                .fill(Color.mint.opacity(0.05 + growth * 0.10))
                .frame(width: CGFloat(55 + growth * 165), height: CGFloat(55 + growth * 165))
                .blur(radius: 14)

            ForEach(-3...3, id: \.self) { root in
                Rectangle()
                    .fill(root.isMultiple(of: 2) ? Color.mint.opacity(0.65) : Color.purple.opacity(0.55))
                    .frame(width: 10, height: 5)
                    .offset(x: CGFloat(root) * 11, y: 88 + CGFloat(abs(root)) * 2)
            }

            ForEach(0..<24, id: \.self) { index in
                let fraction = Double(index + 1) / 24.0
                if fraction <= growth {
                    Rectangle()
                        .fill(index.isMultiple(of: 3) ? Color(red: 0.72, green: 0.97, blue: 0.72) : Color.mint)
                        .frame(width: 7, height: 9)
                        .offset(x: vineX(fraction), y: vineY(fraction))
                        .shadow(color: .mint.opacity(0.35 + growth * 0.35), radius: 3)
                }
            }

            ForEach(Array(leaves.enumerated()), id: \.offset) { _, leaf in
                if growth >= leaf.0 {
                    PixelLeafView(direction: leaf.1)
                        .offset(x: vineX(leaf.0) + leaf.1 * 15, y: vineY(leaf.0) - 3)
                        .transition(.scale.combined(with: .opacity))
                }
            }

            ZStack {
                Rectangle().fill(Color.purple.opacity(0.72)).frame(width: 27, height: 27).rotationEffect(.degrees(45))
                Rectangle().fill(Color.mint).frame(width: 19, height: 19).rotationEffect(.degrees(45))
                Rectangle().fill(Color(red: 1.0, green: 0.96, blue: 0.58)).frame(width: 9, height: 9).rotationEffect(.degrees(45))
            }
            .offset(x: vineX(growth), y: vineY(growth) - 5)
            .scaleEffect(pulsing ? 1.10 : 0.92)
            .shadow(color: .mint.opacity(0.55 + growth * 0.4), radius: CGFloat(8 + growth * 18))

            ForEach(0..<5, id: \.self) { index in
                let angle = Double(index) * (Double.pi * 2 / 5)
                Rectangle()
                    .fill(index.isMultiple(of: 2) ? Color.mint : Color(red: 1.0, green: 0.96, blue: 0.58))
                    .frame(width: 4, height: 4)
                    .offset(
                        x: vineX(growth) + CGFloat(cos(angle)) * CGFloat(24 + growth * 15),
                        y: vineY(growth) - 5 + CGFloat(sin(angle)) * CGFloat(24 + growth * 15)
                    )
                    .opacity(0.35 + growth * 0.65)
            }
        }
        .frame(width: 230, height: 230)
        .animation(.spring(response: 0.7, dampingFraction: 0.72), value: brightness)
        .onAppear { withAnimation(.easeInOut(duration: 1.3).repeatForever(autoreverses: true)) { pulsing = true } }
        .accessibilityLabel("Unbound Agentmon signal vine at \(brightness) percent growth")
    }
}

struct AgentmonMetric: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 8, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            Text(value).font(.system(size: 15, weight: .black, design: .monospaced)).foregroundStyle(.white)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.black.opacity(0.24))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

struct AgentmonDesktopView: View {
    @ObservedObject var controller = AgentmonController.shared
    @State private var confirmCatalogRebuild = false
    private var appVersion: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev" }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.045, green: 0.055, blue: 0.12), Color(red: 0.10, green: 0.08, blue: 0.20)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ).ignoresSafeArea()
            ScrollView {
                VStack(spacing: 18) {
                    header
                    coreLoop
                    HStack(alignment: .top, spacing: 18) {
                        incubator
                        controls
                    }
                    marketplacePanel
                    localModelPanel
                    privacyBar
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
                .padding(.top, 42)
            }
        }
        .frame(minWidth: 860, minHeight: 880)
        .preferredColorScheme(.dark)
        .onAppear {
            controller.inspectLocalState()
            controller.inspectCodexPluginInstallation()
            controller.refreshMarketplace()
        }
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text("AGENTMON").font(.system(size: 25, weight: .black, design: .monospaced)).tracking(4).foregroundStyle(.mint)
                Text("LOCAL INCUBATOR // DERIVED-ONLY // v\(appVersion)").font(.system(size: 10, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)
            }
            Spacer()
            StatusPill(text: controller.isRunning ? "Engine On" : "Engine Off", active: controller.isRunning)
            StatusPill(text: controller.browserPaired ? "Extension Connected" : "Extension Waiting", active: controller.browserPaired)
        }
    }

    private var coreLoopStages: [(String, Bool)] {
        [
            ("CONNECT", controller.browserPaired && controller.browserSiteEnabled),
            ("TRAIN", controller.browserPromptCount > 0),
            ("HATCH", controller.lifecycleStage == "hatched"),
            ("ACTIVATE", controller.browserDownlink != "No Agentmon active"),
            ("MEASURE", controller.outcomeCount > 0),
        ]
    }

    private var coreLoopNextAction: String {
        if !controller.isRunning { return "NEXT · Turn Agentmon on" }
        if !controller.browserPaired { return "NEXT · Install and pair the Chrome extension" }
        if !controller.browserSiteEnabled { return "NEXT · Enable this LLM site in the extension" }
        if controller.browserPromptCount == 0 { return "NEXT · Submit one normal prompt to begin training" }
        if controller.lifecycleStage != "hatched" { return "NEXT · Keep prompting normally until the egg hatches" }
        if controller.browserDownlink == "No Agentmon active" { return "NEXT · Turn Agentmon Mode on in the extension" }
        if controller.outcomeCount == 0 { return "NEXT · Send a real prompt, then click Helped or Missed on its receipt" }
        return "CORE LOOP LIVE · Agentmon is learning from measured outcomes"
    }

    private var coreLoop: some View {
        let completed = coreLoopStages.filter { $0.1 }.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("FIRST WIN LOOP").foregroundStyle(.mint)
                Spacer()
                Text("\(completed)/5 COMPLETE").foregroundStyle(.secondary)
            }
            .font(.system(size: 9, weight: .black, design: .monospaced))
            HStack(spacing: 7) {
                ForEach(Array(coreLoopStages.enumerated()), id: \.offset) { index, stage in
                    HStack(spacing: 5) {
                        Image(systemName: stage.1 ? "checkmark.circle.fill" : "\(index + 1).circle")
                        Text(stage.0)
                    }
                    .font(.system(size: 9, weight: .black, design: .monospaced))
                    .foregroundStyle(stage.1 ? Color.mint : Color.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .background(stage.1 ? Color.mint.opacity(0.08) : Color.black.opacity(0.18))
                    .clipShape(RoundedRectangle(cornerRadius: 7))
                }
            }
            Text(coreLoopNextAction)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(completed == 5 ? Color.mint : Color(red: 1.0, green: 0.82, blue: 0.41))
        }
        .padding(12)
        .background(Color.black.opacity(0.22))
        .overlay(RoundedRectangle(cornerRadius: 11).stroke(Color.purple.opacity(0.35)))
        .clipShape(RoundedRectangle(cornerRadius: 11))
    }

    private var incubator: some View {
        VStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 18)
                    .fill(Color.black.opacity(0.32))
                    .overlay(RoundedRectangle(cornerRadius: 18).stroke(Color.mint.opacity(0.5), lineWidth: 2))
                Circle().fill(Color.mint.opacity(0.06)).frame(width: 230, height: 230).blur(radius: 5)
                if controller.lifecycleStage == "signal" {
                    SignalLightView(brightness: controller.signalBrightness)
                } else if let image = controller.displayImage {
                    Image(nsImage: image).resizable().interpolation(.none).scaledToFit().padding(34)
                } else {
                    Image(systemName: "diamond.fill").font(.system(size: 96)).foregroundStyle(.mint, .purple)
                }
            }.frame(height: 330)
            VStack(spacing: 7) {
                HStack {
                    Text("PIXEL SNAP")
                    Spacer()
                    Text("\(Int(controller.pixelSnapStrength))/10")
                }
                .font(.system(size: 10, weight: .black, design: .monospaced))
                .foregroundStyle(.mint)
                Slider(
                    value: Binding(
                        get: { controller.pixelSnapStrength },
                        set: { controller.previewPixelSnapStrength($0) }
                    ),
                    in: 1...10,
                    step: 1
                )
                    .tint(.mint)
                HStack {
                    Text("TEXTURE")
                    Spacer()
                    Text("HARD GRID")
                }
                .font(.system(size: 8, weight: .bold, design: .monospaced))
                .foregroundStyle(.secondary)
                Text("LIVE PREVIEW · ONLY \(controller.creatureName.uppercased())")
                    .font(.system(size: 8, weight: .black, design: .monospaced))
                    .foregroundStyle(.mint)
                if controller.isApplyingPixelSnap {
                    ProgressView(value: controller.pixelSnapProgress, total: 1)
                        .tint(.mint)
                    Button("CANCEL CATALOG REBUILD") {
                        controller.cancelPixelSnapCatalogRebuild()
                    }
                    .buttonStyle(.bordered)
                    .tint(.orange)
                } else {
                    Button("ADVANCED · REBUILD FULL ART PACK") {
                        confirmCatalogRebuild = true
                    }
                    .buttonStyle(.bordered)
                }
                Text(controller.pixelSnapStatus)
                    .font(.system(size: 8, design: .monospaced))
                    .foregroundStyle(.secondary)
            }
            .padding(10)
            .background(Color.black.opacity(0.2))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .alert("Rebuild the complete art pack?", isPresented: $confirmCatalogRebuild) {
                Button("Rebuild in background", role: .destructive) { controller.rebuildPixelSnapCatalog() }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This advanced tool regenerates 576 forms plus egg variants. The slider already previews this Agentmon instantly, so most users never need this.")
            }
            Text(controller.creatureName.uppercased()).font(.system(size: 20, weight: .black, design: .monospaced)).foregroundStyle(.white)
            if controller.lifecycleStage == "signal" && controller.readiness == 0 {
                VStack(spacing: 7) {
                    Text("NO AGENTMON LOADED FROM THIS PROJECT")
                        .font(.system(size: 9, weight: .black, design: .monospaced))
                        .foregroundStyle(.orange)
                    Button("LOAD EXISTING AGENTMON…") { controller.chooseProject() }
                        .buttonStyle(.borderedProminent)
                        .tint(.orange)
                    Text("Choose the PokemonLLM folder that contains .agentmon/roster/main.")
                        .font(.system(size: 8, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .frame(maxWidth: .infinity)
                .background(Color.orange.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 9))
            }
            HStack {
                Text(controller.lifecycleStage == "signal" ? "SIGNAL STRENGTH" : (controller.lifecycleStage == "egg" ? "EGG STABILITY" : "HATCH READINESS"))
                Spacer()
                Text("\(controller.readiness)%")
            }
                .font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            ProgressView(value: Double(controller.readiness), total: 100).tint(.mint)
            HStack {
                Label("\(controller.skillCount) SKILLS", systemImage: "sparkles")
                Spacer()
                Button("VIEW SKILL.MD") { controller.revealSkills() }.buttonStyle(.link)
            }.font(.system(size: 10, weight: .bold, design: .monospaced))
            if controller.lifecycleStage == "hatched" {
                HStack(spacing: 8) {
                    Text(controller.evolutionForm)
                    Text("LINEAGE GEN \(controller.lineageGeneration)")
                    Spacer()
                    Label("PERMANENT DNA", systemImage: "lock.fill")
                }
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .foregroundStyle(.mint)
                .padding(.horizontal, 11).padding(.vertical, 8)
                .background(Color.mint.opacity(0.08)).clipShape(RoundedRectangle(cornerRadius: 8))
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    AgentmonMetric(label: "PROMPTPRINT", value: "\(controller.promptConfidence)%")
                    AgentmonMetric(label: "SAMPLES", value: "\(controller.promptSamples)")
                    AgentmonMetric(label: "PROCEDURES", value: "\(controller.procedureCount)")
                    AgentmonMetric(label: "ARENA TESTED", value: "\(controller.testedProcedures)")
                    AgentmonMetric(label: "PROVEN", value: "\(controller.provenProcedures)")
                    AgentmonMetric(label: "REAL OUTCOMES", value: "\(controller.outcomeCount)")
                    AgentmonMetric(label: "USEFULNESS", value: "\(controller.effectivenessScore)")
                    AgentmonMetric(label: "BENEFICIAL", value: "\(controller.beneficialProcedures)")
                    AgentmonMetric(label: "REGRESSED", value: "\(controller.regressedProcedures)")
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text("NEXT EVOLUTION").font(.system(size: 8, weight: .black, design: .monospaced)).foregroundStyle(.secondary)
                    Text(controller.nextEvolution.uppercased()).font(.system(size: 10, weight: .bold, design: .monospaced))
                    Text("Prompt training grows skills and evidence; it never silently rewrites form DNA.").font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(18).frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.035)).clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private var controls: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("COMPANION CONTROL").font(.system(size: 12, weight: .black, design: .monospaced)).foregroundStyle(.mint)
            Button(action: controller.togglePower) {
                HStack {
                    Image(systemName: "power")
                    Text(controller.isRunning ? "TURN AGENTMON OFF" : "TURN AGENTMON ON")
                }.frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent).tint(controller.isRunning ? .red.opacity(0.75) : .mint).controlSize(.large)

            Text(controller.statusText).font(.system(size: 11, design: .monospaced)).foregroundStyle(.secondary)
            if let error = controller.errorText {
                Text(error).font(.system(size: 10, design: .monospaced)).foregroundStyle(.red)
            }

            Divider()
            Text("CHROME PAIRING CODE").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            HStack {
                Text(controller.pairingCode).font(.system(size: 17, weight: .black, design: .monospaced)).textSelection(.enabled)
                Spacer()
                Button { controller.copyPairingCode() } label: { Image(systemName: "doc.on.doc") }
                    .disabled(controller.pairingCode == "—")
            }.padding(12).background(Color.black.opacity(0.3)).clipShape(RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 5) {
                Label(controller.browserOrigin, systemImage: controller.browserPaired ? "checkmark.circle.fill" : "circle.dashed")
                    .font(.system(size: 11, weight: .black, design: .monospaced))
                    .foregroundStyle(controller.browserPaired ? .mint : .secondary)
                Label(
                    controller.browserSiteEnabled ? "\(controller.browserSite) · PROMPT CAPTURE ON" : "NO LLM SITE ENABLED",
                    systemImage: controller.browserSiteEnabled ? "dot.radiowaves.left.and.right" : "globe"
                )
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(controller.browserSiteEnabled ? .mint : .secondary)
            }

            Divider()
            Text("LOCAL INTAKE LEDGER").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            HStack {
                AgentmonMetric(label: "SUBMITTED", value: "\(controller.browserPromptCount)")
                AgentmonMetric(label: "SITES ON", value: "\(controller.browserSites.count)")
            }
            if controller.browserSites.isEmpty {
                Text("No enabled LLM sites").font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary)
            } else {
                ForEach(controller.browserSites, id: \.self) { site in
                    Label(site, systemImage: "checkmark.shield.fill").font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.mint)
                }
            }
            Text("LAST: \(controller.browserLastPrompt)").lineLimit(1).font(.system(size: 8, design: .monospaced)).foregroundStyle(.secondary)
            Label("DOWNLINK: \(controller.browserDownlink)", systemImage: "arrow.up.right.circle.fill")
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(controller.browserDownlink == "No Agentmon active" ? Color.secondary : Color.mint)
            Text("AUTO-ROUTE THIS TAB: /agentmon auto main  ·  OFF: /agentmon auto off")
                .font(.system(size: 8, weight: .black, design: .monospaced))
                .foregroundStyle(.cyan)
            Text("AFTER A RESPONSE: /agentmon helped  OR  /agentmon missed")
                .font(.system(size: 8, weight: .black, design: .monospaced))
                .foregroundStyle(.mint)
            Text("TAKES IN: submitted user prompts only\nRETAINS: derived dimensions, evidence digests, skill/loop hypotheses\nEXCLUDES: drafts, responses, raw text, credentials")
                .font(.system(size: 8, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)

            Divider()
            Text("ACTION AGENTMON · STAKES ENGINE").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.yellow)
            HStack {
                AgentmonMetric(label: "RESONANCE", value: controller.actionResonance)
                AgentmonMetric(label: "EVENTS", value: "\(controller.actionObservedEvents)")
                AgentmonMetric(label: "PROPOSED", value: "\(controller.actionProposals)")
                AgentmonMetric(label: "APPROVED", value: "\(controller.actionApproved)")
            }
            Label("BATTLE STATE: \(controller.actionBattleState) \(controller.actionBattleIntensity)/5", systemImage: "heart.text.square.fill")
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .foregroundStyle(controller.actionBattleIntensity > 0 ? Color.yellow : Color.secondary)
            if controller.actionLearningSites.isEmpty {
                Text("Action Learning is off. Enable it separately in the extension.")
                    .font(.system(size: 9, design: .monospaced)).foregroundStyle(.secondary)
            } else {
                ForEach(controller.actionLearningSites, id: \.self) { site in
                    Label("\(site) · SEMANTIC ACTIONS ON", systemImage: "cursorarrow.motionlines")
                        .font(.system(size: 9, weight: .bold, design: .monospaced)).foregroundStyle(.yellow)
                }
            }
            Text("CHECK · CALL · RAISE · STAY · FOLD · BLUFF* · ALL-IN*\n*Bluff is game/sandbox only. All-in requires explicit confirmation. No raw page text, values, selectors, paths, or screenshots are retained.")
                .font(.system(size: 8, weight: .semibold, design: .monospaced)).foregroundStyle(.secondary)

            Divider()
            Text("CODEX COMPANION PLUGIN").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.mint)
            Button(action: controller.installCodexPlugin) {
                HStack {
                    if controller.isInstallingCodexPlugin {
                        ProgressView().controlSize(.small)
                    } else {
                        Image(systemName: controller.codexPluginInstalled ? "checkmark.seal.fill" : "puzzlepiece.extension.fill")
                    }
                    Text(controller.codexPluginInstalled ? "REINSTALL CODEX PLUGIN" : "INSTALL CODEX PLUGIN")
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(controller.codexPluginInstalled ? .purple : .mint)
            .disabled(controller.isInstallingCodexPlugin)
            Text(controller.codexPluginStatus)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(controller.codexPluginInstalled ? Color.mint : Color.secondary)
            Text("Installs locally, refreshes the approved runtime pack, and connects through this project folder. Start a new Codex chat, type @agentmon-companion, then say: Activate my main Agentmon.")
                .font(.system(size: 8, design: .monospaced))
                .foregroundStyle(.secondary)

            Divider()
            Text("CONNECT THE EXTENSION").font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(.secondary)
            step("1", "Turn Agentmon on")
            step("2", "Load the Chrome extension")
            step("3", "Paste the pairing code")
            step("4", "Enable one LLM website")
            HStack {
                Button("OPEN CHROME") { controller.openChromeExtensions() }
                Button("GET EXTENSION") { controller.installChromeExtension() }
            }.buttonStyle(.bordered)
            Text("GET EXTENSION copies the verified bundled extension locally, opens Chrome, and reveals the folder. Chrome still requires Developer Mode → Load unpacked.")
                .font(.system(size: 8, design: .monospaced))
                .foregroundStyle(.secondary)

            Spacer()
            Button("CHANGE PROJECT…") { controller.chooseProject() }.buttonStyle(.link)
            Text(controller.projectRoot).lineLimit(2).font(.system(size: 9, design: .monospaced)).foregroundStyle(.tertiary)
        }
        .padding(20).frame(width: 340).frame(maxHeight: .infinity, alignment: .top)
        .background(Color.white.opacity(0.035)).clipShape(RoundedRectangle(cornerRadius: 22))
    }

    private func step(_ number: String, _ text: String) -> some View {
        HStack(spacing: 9) {
            Text(number).font(.system(size: 9, weight: .black, design: .monospaced))
                .frame(width: 20, height: 20).background(Color.purple.opacity(0.5)).clipShape(Circle())
            Text(text).font(.system(size: 11, design: .monospaced))
        }
    }

}
