import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const AUTHORED_MODULES = [
  "lib/engine/training.ts", "lib/engine/types.ts", "lib/engine/lifecycle.ts", "lib/engine/deployment.ts", "lib/engine/naming.ts", "lib/engine/recipes.ts", "lib/engine/procedure-routing.ts", "lib/engine/procedure-boundary.ts", "lib/engine/catalog.ts",
  "lib/runtime/storage.mjs", "lib/runtime/training-service.mjs", "lib/runtime/procedure-proof-service.mjs", "lib/runtime/package-lifecycle-service.mjs", "lib/runtime/economy-service.mjs", "lib/runtime/v4-learning-service.mjs",
  "lib/effectiveness/outcome-engine.mjs", "lib/effectiveness/portability-engine.mjs", "lib/routing/context-router.mjs", "lib/routing/routing-policy.mjs", "lib/semantics/semantic-induction.mjs", "lib/squad/squad-orchestrator.mjs", "lib/db/effectiveness-store.mjs",
  "lib/privacy/local-vault.mjs", "lib/adapters/native-client.mjs", "scripts/universal-hook-adapter.mjs", "scripts/agentmon-companion.mjs", "scripts/agentmon-daemon.mjs", "scripts/import-chatgpt-export.mjs", "scripts/migrate-feed-to-vault.mjs",
  "browser-extension/background.js", "browser-extension/content.js", "browser-extension/popup.js",
  "lib/db/local-store.mjs", "scripts/agentmon.mjs", "scripts/agentmon-db.mjs", "scripts/agentmon-economy-server.mjs", "lib/ownership/transfer-crypto.mjs", "lib/ownership/ownership-authority.mjs", "lib/economy/verified-economy.mjs", "lib/economy/authority-registry.mjs", "lib/economy/transition-protocol.mjs", "lib/economy/transition-authority.mjs",
  "lib/visual/phenotype-engine.mjs", "lib/visual/curated-visual-engine.mjs", "lib/visual/palette-engine.mjs", "lib/visual/material-ramp.mjs", "lib/visual/raster-primitives.mjs", "lib/visual/premium-chassis.mjs", "lib/visual/premium-components.mjs", "lib/visual/pixel-renderer.mjs", "lib/visual/visual-lineage.mjs", "lib/visual/gallery-renderer.mjs", "scripts/agentmon-visual-gallery.mjs", "scripts/agentmon-curated-gallery.mjs", "scripts/build-curated-visual-pack.mjs", "scripts/agentmon-app-sprites.mjs",
  "lib/proof/isolated-workspace.mjs", "lib/proof/human-scoring.mjs", "lib/proof/proof-certificate.mjs",
  "desktop-app/desktop-browser-server.mjs", "desktop-app/desktop-model-provider-routes.mjs", "desktop-app/desktop-action-routes.mjs", "desktop-app/desktop-downlink-service.mjs", "lib/model-provider-registry.mjs", "desktop-app/AgentmonController.swift", "desktop-app/AgentmonController+Browser.swift", "desktop-app/AgentmonController+LocalModel.swift", "desktop-app/AgentmonController+PixelSnap.swift", "desktop-app/AgentmonViews.swift", "desktop-app/AgentmonPanels.swift"
];

test("keeps authored engine boundaries below the god-file ceiling", async () => {
  const pluginRoot = resolve(import.meta.dirname, "..");
  for (const relativePath of AUTHORED_MODULES) {
    const lines = (await readFile(resolve(pluginRoot, relativePath), "utf8")).split("\n").length;
    assert.ok(lines <= 500, `${relativePath} has ${lines} lines; split it before adding more behavior`);
  }
});
