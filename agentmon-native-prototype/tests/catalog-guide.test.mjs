import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const catalogRoot = resolve(root, "ui/assets/agentmon-master-catalog");

test("the Guide exposes the complete sheet-independent Agentmon catalog", async () => {
  const catalog = JSON.parse(await readFile(resolve(catalogRoot, "catalog.json"), "utf8"));
  const audit = JSON.parse(await readFile(resolve(catalogRoot, "sprite-audit.json"), "utf8"));
  const markup = await readFile(resolve(root, "ui/index.html"), "utf8");
  const source = await readFile(resolve(root, "ui/catalog.js"), "utf8");
  const styles = await readFile(resolve(root, "ui/catalog.css"), "utf8");

  assert.equal(catalog.speciesCount, 96);
  assert.equal(catalog.agentmonAppearanceCount, 1152);
  assert.equal(catalog.eggAppearanceCount, 384);
  assert.equal(catalog.totalSpriteCount, 1536);
  assert.equal(catalog.sheetIndependent, true);
  assert.equal(catalog.edgeSafe, true);
  assert.equal(audit.edgeSafe, true);
  assert.equal(audit.sprites.length, 1536);
  assert.ok(audit.sprites.every((sprite) => sprite.edgeSafe && sprite.minimumPadding >= 1));
  assert.equal(new Set(catalog.species.map((species) => species.fieldGuide.catalogNumber)).size, 96);
  assert.equal(new Set(catalog.species.map((species) => species.fieldGuide.lore)).size, 96);
  assert.ok(catalog.species.every((species) => species.fieldGuide.habitat && species.fieldGuide.ecologyClass && species.fieldGuide.signatureMove && species.fieldGuide.fieldNote));
  assert.match(markup, /data-view="guide">Guide/);
  assert.match(markup, /Every Agentmon\. Nothing cropped\./);
  assert.match(markup, /FIELD GUIDE ENTRY/);
  assert.match(markup, /id="guide-detail-hero"/);
  assert.match(source, /loading = "lazy"/);
  assert.match(source, /const PAGE_SIZE = 16/);
  assert.match(source, /visible\.slice\(currentPage \* PAGE_SIZE/);
  assert.match(source, /detailDialog\.showModal\(\)/);
  assert.match(source, /Expand \$\{species\.name\} evolution line/);
  assert.match(source, /function selectDetailStage/);
  assert.match(source, /fieldGuide\.lore/);
  assert.match(source, /catalog\.edgeSafe/);
  assert.match(styles, /object-fit: contain/);
  assert.match(styles, /overflow: hidden/);
  assert.match(styles, /\.collector-card-body/);
});
