import { renderCreaturePixels, renderEggPixels } from "./pixel-renderer.mjs";
import { blit, createSurface, encodePng, fill } from "./raster-primitives.mjs";

export function renderPhenotypeGallery(phenotypes, options = {}) {
  if (!Array.isArray(phenotypes) || !phenotypes.length) throw new Error("At least one phenotype is required for a gallery.");
  const columns = Math.max(1, Math.min(32, Number(options.columns) || 8));
  const cell = 72;
  const rows = Math.ceil(phenotypes.length / columns);
  const kind = options.kind === "egg" ? "egg" : "creature";
  const render = kind === "egg" ? renderEggPixels : renderCreaturePixels;
  const output = createSurface(columns * cell, rows * cell);
  fill(output, [255, 247, 226, 255]);
  phenotypes.forEach((phenotype, index) => {
    const x = (index % columns) * cell + 4;
    const y = Math.floor(index / columns) * cell + 4;
    blit(output, render(phenotype), x, y);
  });
  return {
    surface: output,
    png: encodePng(output, Math.max(1, Math.min(4, Number(options.scale) || 2))),
    layout: { columns, rows, cell, count: phenotypes.length, kind },
  };
}
