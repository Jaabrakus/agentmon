const grid = document.getElementById("guide-grid");
const summary = document.getElementById("guide-summary");
const status = document.getElementById("guide-status");
const empty = document.getElementById("guide-empty");
const search = document.getElementById("guide-search");
const biomeSelect = document.getElementById("guide-biome");
const morphSelect = document.getElementById("guide-morph");
const previousButton = document.getElementById("guide-previous");
const nextButton = document.getElementById("guide-next");
const pageLabel = document.getElementById("guide-page");
const detailDialog = document.getElementById("guide-detail");
const detailName = document.getElementById("guide-detail-name");
const detailMeta = document.getElementById("guide-detail-meta");
const detailLine = document.getElementById("guide-detail-line");
const detailHero = document.getElementById("guide-detail-hero");
const detailNumber = document.getElementById("guide-detail-number");
const detailRarity = document.getElementById("guide-detail-rarity");
const detailClass = document.getElementById("guide-detail-class");
const detailLore = document.getElementById("guide-detail-lore");
const detailHabitat = document.getElementById("guide-detail-habitat");
const detailSignature = document.getElementById("guide-detail-signature");
const detailFieldNote = document.getElementById("guide-detail-field-note");
const detailTraits = document.getElementById("guide-detail-traits");
let catalog = null;
let loading = null;
let currentPage = 0;
const PAGE_SIZE = 16;

function textNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = text;
  return node;
}

function stageFigure(species, stage, morph) {
  const figure = document.createElement("figure");
  const frame = document.createElement("div");
  frame.className = "guide-sprite-frame";
  const image = document.createElement("img");
  image.src = species.appearances[stage.id][morph];
  image.alt = `${species.name} ${stage.label}, ${morph} variant`;
  image.loading = "lazy";
  image.decoding = "async";
  frame.append(image);
  figure.append(frame, textNode("figcaption", "", stage.label));
  return figure;
}

function speciesCard(species, morph) {
  const card = document.createElement("article");
  card.className = "guide-card";
  card.dataset.species = species.id;
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `Expand ${species.name} evolution line`);
  const heading = document.createElement("header");
  const title = document.createElement("div");
  title.append(textNode("h3", "", species.name), textNode("p", "", species.role ? `${species.biome.name} · ${species.role}` : species.biome.name));
  const headingActions = document.createElement("div");
  headingActions.className = "guide-heading-actions";
  headingActions.append(textNode("span", "guide-species-id", species.fieldGuide?.catalogNumber || species.id.toUpperCase()), textNode("span", "guide-expand", "OPEN CARD ↗"));
  heading.append(title, headingActions);
  const line = document.createElement("div");
  line.className = "guide-evolution-line";
  for (const [index, stage] of catalog.stages.entries()) {
    if (index) line.append(textNode("span", "guide-arrow", "→"));
    line.append(stageFigure(species, stage, morph));
  }
  const traits = document.createElement("footer");
  traits.append(
    textNode("span", "", species.bodyTopology),
    textNode("span", "", species.eyeSystem),
    textNode("span", "", species.paletteFamily),
  );
  card.append(heading, line, traits);
  card.addEventListener("click", () => openSpecies(species, morph));
  card.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openSpecies(species, morph);
  });
  return card;
}

function selectDetailStage(species, stage, morph) {
  detailHero.src = species.appearances[stage.id][morph];
  detailHero.alt = `${species.name} ${stage.label}, ${morph} variant`;
  for (const button of detailLine.querySelectorAll("button")) {
    const selected = button.dataset.stage === stage.id;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function stageButton(species, stage, morph) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "collector-stage-button";
  button.dataset.stage = stage.id;
  button.setAttribute("aria-label", `Show ${species.name} ${stage.label}`);
  button.setAttribute("aria-pressed", "false");
  const image = document.createElement("img");
  image.src = species.appearances[stage.id][morph];
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  button.append(image, textNode("span", "", stage.label));
  button.addEventListener("click", () => selectDetailStage(species, stage, morph));
  return button;
}

function openSpecies(species, morph) {
  const fieldGuide = species.fieldGuide || {};
  const morphRecord = catalog.morphs.find((entry) => entry.id === morph);
  detailName.textContent = species.name;
  detailMeta.textContent = `${species.biome.name} · ${species.role || "native species"}`;
  detailNumber.textContent = fieldGuide.catalogNumber || species.id.toUpperCase();
  detailRarity.textContent = `${morphRecord?.rarity || "common"} · ${morph}`.toUpperCase();
  detailClass.textContent = fieldGuide.ecologyClass || species.role || "Native species";
  detailLore.textContent = fieldGuide.lore || `${species.name} is a native of ${species.biome.name}.`;
  detailHabitat.textContent = fieldGuide.habitat || species.biome.name;
  detailSignature.textContent = fieldGuide.signatureMove || "Unrecorded";
  detailFieldNote.textContent = fieldGuide.fieldNote || "Field observations are still being recorded.";
  detailLine.replaceChildren(...catalog.stages.map((stage) => stageButton(species, stage, morph)));
  detailTraits.replaceChildren(
    textNode("span", "", `BODY · ${species.bodyTopology}`),
    textNode("span", "", `EYES · ${species.eyeSystem}`),
    textNode("span", "", `SENSORS · ${species.sensorSystem}`),
    textNode("span", "", `PALETTE · ${species.paletteFamily}`),
  );
  if (!detailDialog.open) detailDialog.showModal();
  const defaultStage = catalog.stages.find((stage) => stage.id === "form-02") || catalog.stages[0];
  selectDetailStage(species, defaultStage, morph);
}

function render() {
  if (!catalog) return;
  const query = search.value.trim().toLowerCase();
  const biome = biomeSelect.value;
  const morph = morphSelect.value;
  const visible = catalog.species.filter((species) => {
    const searchable = [species.name, species.id, species.role, species.biome.name, species.bodyTopology, species.eyeSystem, species.sensorSystem, species.paletteFamily, species.fieldGuide?.ecologyClass, species.fieldGuide?.habitat, species.fieldGuide?.signatureMove, species.fieldGuide?.lore].filter(Boolean).join(" ").toLowerCase();
    return (biome === "all" || species.biome.id === biome) && (!query || searchable.includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount - 1);
  const pageSpecies = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  grid.replaceChildren(...pageSpecies.map((species) => speciesCard(species, morph)));
  empty.hidden = visible.length !== 0;
  previousButton.disabled = currentPage === 0;
  nextButton.disabled = currentPage >= pageCount - 1 || visible.length === 0;
  pageLabel.textContent = visible.length ? `PAGE ${currentPage + 1} / ${pageCount}` : "PAGE —";
  status.textContent = `${visible.length} of ${catalog.speciesCount} species · showing ${pageSpecies.length} · ${morph.toUpperCase()} variant · four complete stages per species`;
}

async function loadCatalog() {
  if (catalog) return catalog;
  if (loading) return loading;
  loading = fetch("./assets/agentmon-master-catalog/catalog.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
      return response.json();
    })
    .then((result) => {
      catalog = result;
      if (!catalog.edgeSafe || catalog.speciesCount !== catalog.species.length) throw new Error("Catalog integrity check failed");
      summary.textContent = `${catalog.speciesCount} species · ${catalog.agentmonAppearanceCount} Agentmon appearances · ${catalog.eggAppearanceCount} eggs · every sprite passed its clipping audit.`;
      for (const biome of catalog.biomes) {
        const option = document.createElement("option");
        option.value = biome.id;
        option.textContent = `${biome.name.toUpperCase()} · ${biome.speciesCount}`;
        biomeSelect.append(option);
      }
      for (const morph of catalog.morphs) {
        if (morph.id === "standard") continue;
        const option = document.createElement("option");
        option.value = morph.id;
        option.textContent = `${morph.id.toUpperCase()} · ${(morph.weight / 100).toFixed(morph.weight % 100 ? 1 : 0)}%`;
        morphSelect.append(option);
      }
      render();
      return catalog;
    })
    .catch((error) => {
      status.textContent = `Master catalog unavailable: ${error.message}`;
      status.classList.add("error");
      throw error;
    });
  return loading;
}

document.querySelector('[data-view="guide"]').addEventListener("click", () => { loadCatalog().catch(() => {}); });
search.addEventListener("input", () => { currentPage = 0; render(); });
biomeSelect.addEventListener("change", () => { currentPage = 0; render(); });
morphSelect.addEventListener("change", () => { currentPage = 0; render(); });
previousButton.addEventListener("click", () => { currentPage = Math.max(0, currentPage - 1); render(); grid.scrollTop = 0; });
nextButton.addEventListener("click", () => { currentPage += 1; render(); grid.scrollTop = 0; });
document.getElementById("guide-detail-close").addEventListener("click", () => detailDialog.close());
detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
