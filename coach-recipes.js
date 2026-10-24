(function recipesBootstrap() {
  "use strict";
  const A = window.AF,
    C = A.C,
    E = A.esc,
    F = A.field,
    S = A.select,
    B = A.button,
    N = A.note,
    K = A.card;
  let loaded = false,
    plan = A.state.cookingPlans.at(-1) || null,
    editing = null;
  const labels = {
    kcal: "Kalorien (kcal)",
    protein_g: "Protein (g)",
    carbs_g: "Kohlenhydrate (g)",
    fat_g: "Fett (g)",
    fiber_g: "Ballaststoffe (g)",
    sodium_mg: "Natrium (mg)",
  };
  const nutrientText = (n) =>
    n
      ? C.NUTRIENTS.map((k) => labels[k] + ": " + n[k]).join(" · ")
      : "Noch nicht berechenbar";
  function save() {
    A.persist();
  }
  async function loadLibrary() {
    if (loaded) return;
    try {
      const response = await fetch("./recipe-library.json");
      if (!response.ok) throw Error("Rezeptbibliothek nicht erreichbar");
      const data = await response.json();
      const errors = C.validateRecipes(data);
      if (errors.length) throw Error(errors.join(" "));
      for (const r of data.recipes)
        if (!A.state.recipes.some((e) => e.id === r.id))
          A.state.recipes.push(r);
      save();
      loaded = true;
    } catch (e) {
      showToast(
        "Rezeptbibliothek fehlt. Eigene Rezepte können importiert oder erstellt werden.",
      );
    }
  }
  function recipesForPlan() {
    return plan?.recipes || [];
  }
  function shoppingList() {
    return C.shopping(recipesForPlan(), plan?.extras || []);
  }
  function nutritionTable(r) {
    const n = C.recipeNutrition(r),
      rows = C.NUTRIENTS.map(
        (k) =>
          `<tr><th>${labels[k]}</th><td>${n.perServing?.[k] ?? "—"}</td><td>${n.per100g?.[k] ?? "—"}</td></tr>`,
      ).join("");
    return `<div class="af-tablewrap"><table class="af-table"><thead><tr><th>Nährwerte ≈</th><th>pro Portion</th><th>pro 100 g</th></tr></thead><tbody>${rows}</tbody></table></div>${!n.complete ? N("Fehlende Mengen oder vollständige Etikettwerte: " + E(n.missing.join(", "))) : ""}${N(n.finishedWeightG ? `Fertiges Gericht: ${n.finishedWeightG} g · pro Portion: ${n.portionWeightG} g · ${n.weightMeasured ? "tatsächlich gewogen" : "geschätztes Gewicht"}.` : "Fertiges Gericht nach dem Kochen wiegen. Ohne Endgewicht werden keine Werte pro 100 g erfunden.")}${N("Berechnung aus eingetragenen Zutatenmengen. Angaben mit < wurden in den Beispielen als Obergrenze eingetragen. Etiketten bei Produktwechsel prüfen.")}`;
  }
  function budget() {
    const items = shoppingList(),
      known = items
        .filter((e) => e.costCHF !== null)
        .reduce((a, e) => a + e.costCHF, 0),
      missing = items.filter((e) => e.costCHF === null);
    return K(
      "Budget für die Woche",
      `<p><strong>${known.toFixed(2)} CHF</strong> für Artikel mit hinterlegtem Packungspreis.</p>${N(missing.length ? `${missing.length} Artikel ohne Preis. Gesamtbudget noch offen; Snacks und Wochenendessen ergänzen.` : `Erfasster Gesamteinkauf: ${known.toFixed(2)} CHF. ${known > (plan?.budgetCHF || 75) ? "Über deinem eingestellten Budget." : "Innerhalb des eingestellten Budgets."}`)}${N("Packungen werden aufgerundet. Hinterlegte Preise sind Richtwerte vom Erfassungsdatum; Aktionen und Filialpreise können abweichen.")}`,
    );
  }
  function shoppingHtml() {
    const items = shoppingList(),
      cats = [...new Set(items.map((i) => i.category))];
    return `<div class="af-shopping">${cats
      .map(
        (c) =>
          `<h3>${E(c)}</h3>${items
            .filter((i) => i.category === c)
            .map(
              (i) =>
                `<label class="af-shopitem"><input type="checkbox"><span>${E(i.name)}<br><strong>${i.amount} ${E(i.unit)}</strong>${i.costCHF !== null ? " · " + i.costCHF.toFixed(2) + " CHF" : ""}</span></label>`,
            )
            .join("")}`,
      )
      .join("")}</div>`;
  }
  function scheduleHtml() {
    const recipes = recipesForPlan(),
      schedule = C.cookingSchedule(recipes, plan?.equipment),
      end = schedule.length ? Math.max(...schedule.map((s) => s.end)) : 0;
    return `<p>Eine gemeinsame Kochsession · ungefähr ${end} Minuten.</p>${N("Arbeitszeit, Geräte und passive Garzeit werden zusammen geplant. Geräte sind einzelne Töpfe / Pfannen; bei anderer Ausstattung unten anpassen.")}<div class="af-timeline">${schedule
      .map(
        (s, i) =>
          `<article><time>Minute ${s.start}–${s.end} · ${E(s.device)} · ${E(s.recipeName)}</time><strong>${i + 1}. ${E(s.shortLabel || "Nächster Schritt")}</strong><p>${E(s.text)}</p><span class="af-badge">${s.activeEnd - s.start} Min. aktiv</span>${s.end > s.activeEnd ? `<span class="af-badge">${s.end - s.activeEnd} Min. passiv</span>` : ""}${s.tip ? N(E(s.tip)) : ""}${
            s.uses?.length
              ? N(
                  s.uses
                    .map((u) => {
                      const r = recipes.find((r) => r.id === s.recipeId),
                        ing = r.ingredients.find(
                          (i) => i.id === u.ingredientId,
                        );
                      return ing
                        ? E(ing.productName || ing.name) +
                            " " +
                            (u.amount ?? ing.amount) +
                            " " +
                            E(u.unit || ing.unit)
                        : "";
                    })
                    .join(" · "),
                )
              : ""
          }</article>`,
      )
      .join("")}</div>`;
  }
  async function render() {
    await loadLibrary();
    plan = A.state.cookingPlans.at(-1) || plan;
    const recipes = A.state.recipes,
      opts = [
        ["", "Kein zweites Gericht"],
        ...recipes.map((r) => [r.id, r.name]),
      ],
      first = plan?.sourceIds?.[0] || recipes[0]?.id || "",
      second = plan?.sourceIds?.[1] || "";
    A.screen(
      "cooking",
      "Sonntagskochen",
      N(
        "Wähle ein oder zwei Gerichte und die tatsächliche Portionszahl. Die Rezeptbasen sind Beispiele; du kannst weitere Gerichte importieren oder selbst anlegen.",
      ) +
        `<form data-af-form="cook-plan"><section class="af-card af-no-print"><h2>Deine Kochwoche</h2><div class="af-grid">${F("Montag der Kochwoche", "af-cook-week", plan?.week || C.monday(todayISO()), "date", "required")}${F("Lebensmittelbudget (CHF)", "af-cook-budget", plan?.budgetCHF || 75, "number", 'min="1" max="500" required')}${S(
          "Gericht A",
          "af-recipe-a",
          recipes.map((r) => [r.id, r.name]),
          first,
        )}${F("Portionen A", "af-portions-a", plan?.recipes?.[0]?.servings || 5, "number", 'min="1" max="30" required')}${S("Gericht B", "af-recipe-b", opts, second)}${F("Portionen B", "af-portions-b", plan?.recipes?.[1]?.servings || 5, "number", 'min="1" max="30"')}${F("Verfügbare Töpfe", "af-pots", plan?.equipment?.Topf || 2, "number", 'min="1" max="5"')}${F("Verfügbare Pfannen", "af-pans", plan?.equipment?.Pfanne || 1, "number", 'min="1" max="5"')}</div><button type="submit" class="af-btn af-primary">Kochsession zusammenstellen</button></section></form>` +
        `<div class="af-toolbar af-no-print">${B("Rezept erstellen", "new-recipe")}${B("recipes.json importieren", "import-recipes")}${B("Gespeicherte Rezepte", "recipe-library")}</div><input type="file" accept=".json,application/json" id="af-recipe-import" hidden>` +
        (plan
          ? `${N(`${plan.recipes.length} Gericht(e) · insgesamt ${plan.recipes.reduce((a, r) => a + r.servings, 0)} Portionen`)}${plan.recipes.map((r, i) => K(E(r.name), `<p>${r.servings} Portionen · ${r.freezable ? "einfrierbar" : "nicht einfrierbar"}</p>${nutritionTable(r)}<form class="af-no-print" data-af-form="cooked-weight" data-index="${i}">${F("Tatsächlich gewogenes Endgewicht (g)", "af-finished-" + i, r.weightMeasured ? r.finishedWeightG : "", "number", 'min="1" required')}<button class="af-btn" type="submit">Endgewicht übernehmen</button></form>${r.notes?.map((t) => N(E(t))).join("") || ""}${B("Für Yazio kopieren", "copy-recipe", `data-index="${i}"`)}<details><summary>Zutaten und Produktdaten</summary><ul>${r.ingredients.map((ing) => `<li>${ing.amount} ${E(ing.unit)} ${E(ing.productName || ing.name)} ${ing.nutritionSource ? `<a href="${E(safeURL(ing.nutritionSource))}" target="_blank" rel="noopener">Etikettquelle</a>` : ""}</li>`).join("")}</ul></details>`)).join("")}${K("Verzahnter Kochablauf", scheduleHtml())}${K("Gemeinsame Einkaufsliste", shoppingHtml())}${budget()}${K(
              "Snacks und Wochenende ergänzen",
              `<form data-af-form="cook-extra"><div class="af-grid">${F("Genauer Produktname", "af-extra-name", "", "text", 'required placeholder="z.B. dein Skyr-Produkt"')}${F("Benötigte Menge", "af-extra-amount", "", "number", 'min="0.1" step="0.1" required')}${S(
                "Einheit",
                "af-extra-unit",
                [
                  ["g", "g"],
                  ["ml", "ml"],
                ],
                "g",
              )}${F("Packungsinhalt (g / ml)", "af-extra-package", "", "number", 'min="1" required')}${F("Preis pro Packung (CHF)", "af-extra-price", "", "number", 'min="0" step="0.01" required')}${S(
                "Kategorie",
                "af-extra-category",
                [
                  ["Milch & Käse", "Milch & Käse"],
                  ["Früchte & Gemüse", "Früchte & Gemüse"],
                  ["Protein & Health", "Protein & Health"],
                  ["Süßes & Snacks", "Süsses & Snacks"],
                  ["Tiefkühl", "Tiefkühl"],
                  ["Sonstiges", "Sonstiges"],
                ],
                "Milch & Käse",
              )}</div><button type="submit" class="af-btn">Zum Einkauf hinzufügen</button></form>${N("Denk an Skyr, Quark, Waffeln, Bananen, Saisonfrüchte, Honig und Proteinpulver. Ergänze auch die geplanten Wochenendmahlzeiten, damit das Budget vollständig ist.")}`,
            )}<div class="af-toolbar af-no-print">${B("Drucken / PDF", "print-cooking")}${B("Einkaufsliste JSON", "export-shopping")}${B("recipes.json fürs iPad", "export-recipes")}</div>`
          : N("Noch keine Kochsession gespeichert.")),
    );
    document
      .getElementById("af-recipe-import")
      ?.addEventListener("change", (e) => importRecipes(e.target.files[0]));
  }
  function safeURL(v) {
    try {
      const u = new URL(v);
      return ["https:", "http:"].includes(u.protocol) ? u.href : "#";
    } catch (e) {
      return "#";
    }
  }
  function compilePlan() {
    const a = A.state.recipes.find((r) => r.id === A.val("af-recipe-a")),
      b = A.state.recipes.find((r) => r.id === A.val("af-recipe-b"));
    if (!a || a.id === b?.id) {
      showToast("Ein oder zwei verschiedene Gerichte wählen.");
      return;
    }
    const week = A.val("af-cook-week");
    if (!C.isoDate(week)) {
      showToast("Kochwoche prüfen.");
      return;
    }
    const selected = [
      C.scaleRecipe(a, A.num("af-portions-a")),
      ...(b ? [C.scaleRecipe(b, A.num("af-portions-b"))] : []),
    ];
    if (
      selected.some(
        (r) =>
          !r.freezable ||
          /aubergine|pilz|champignon|suppe/i.test(
            r.name + " " + r.ingredients.map((i) => i.name).join(" "),
          ),
      )
    ) {
      showToast(
        "Für die Sonntagssession einfrierbare Gerichte ohne Aubergine, Pilze und Suppe wählen.",
      );
      return;
    }
    plan = {
      id: C.monday(week),
      week: C.monday(week),
      budgetCHF: A.num("af-cook-budget"),
      sourceIds: [a.id, ...(b ? [b.id] : [])],
      recipes: selected,
      extras: plan?.extras || [],
      equipment: {
        Topf: A.num("af-pots"),
        Pfanne: A.num("af-pans"),
        Ofen: 1,
        Arbeitsplatte: 1,
      },
    };
    A.state.cookingPlans = A.state.cookingPlans.filter((p) => p.id !== plan.id);
    A.state.cookingPlans.push(plan);
    save();
    render();
  }
  async function importRecipes(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text()),
        errors = C.validateRecipes(data);
      if (errors.length) {
        showToast(errors[0]);
        return;
      }
      for (const r of data.recipes) {
        const ix = A.state.recipes.findIndex((e) => e.id === r.id);
        if (ix >= 0) {
          const old = A.state.recipes[ix];
          if (JSON.stringify(old) !== JSON.stringify(r)) {
            const suffix = A.uid().slice(0, 8);
            r.id = r.id + "-" + suffix;
            const ids = new Map();
            for (const i of r.ingredients) {
              const oldId = i.id;
              i.id = oldId + "-" + suffix;
              ids.set(oldId, i.id);
            }
            for (const step of [...(r.misEnPlace || []), ...r.steps]) {
              step.id += "-" + suffix;
              if (step.recipeId) step.recipeId = r.id;
              for (const use of step.uses || [])
                use.ingredientId =
                  ids.get(use.ingredientId) || use.ingredientId;
            }
          }
        }
        A.state.recipes.push(r);
      }
      A.state.recipes = [
        ...new Map(A.state.recipes.map((r) => [r.id, r])).values(),
      ];
      save();
      showToast("Rezepte importiert ✓");
      render();
    } catch (e) {
      showToast("Keine gültige recipes.json.");
    }
  }
  function newRecipe() {
    const id = "rezept-" + A.uid().slice(0, 8);
    editing = {
      id,
      name: "",
      servings: 5,
      freezable: true,
      notes: ["Nach dem Kochen rasch abkühlen und portionsweise einfrieren."],
      ingredients: [
        {
          id: id + "-ing-1",
          name: "",
          productName: "",
          amount: 100,
          unit: "g",
          category: "sonstiges",
          nutritionPer100g: {},
        },
      ],
      misEnPlace: [],
      steps: [
        {
          id: id + "-s1",
          recipeId: id,
          order: 1,
          text: "",
          shortLabel: "Zubereiten",
          timeMinutes: 10,
          activeMinutes: 10,
          device: "Pfanne",
          uses: [],
        },
      ],
    };
    renderEditor();
  }
  function renderEditor() {
    A.screen(
      "recipe-editor",
      "Rezept bearbeiten",
      `<form data-af-form="recipe-editor"><div class="af-grid">${F("Gerichtname", "af-edit-name", editing.name, "text", "required")}${F("Portionen des Originalrezepts", "af-edit-servings", editing.servings, "number", 'min="1" max="30" required')}</div><label class="af-check"><input id="af-edit-freeze" type="checkbox" ${editing.freezable ? "checked" : ""}>Einfrierbar</label>${editing.ingredients
        .map(
          (ing, i) =>
            `<details class="af-card" ${i === 0 ? "open" : ""}><summary>Zutat ${i + 1}: ${E(ing.productName || ing.name || "Neue Zutat")}</summary><div class="af-grid">${F("Name", "af-ing-name-" + i, ing.name, "text", "required")}${F("Genauer Schweizer Produktname", "af-ing-product-" + i, ing.productName || ing.name, "text", "required")}${F("Benötigte Menge", "af-ing-amount-" + i, ing.amount, "number", 'min="0.01" step="0.01" required')}${S(
              "Einheit",
              "af-ing-unit-" + i,
              [
                "g",
                "kg",
                "ml",
                "l",
                "EL",
                "TL",
                "Stück",
                "Zehen",
                "Bund",
                "Dose",
              ].map((v) => [v, v]),
              ing.unit,
            )}${F("Essbare Rohmenge (g), falls nicht in g", "af-ing-raw-" + i, ing.rawGrams, "number", 'min="0.01" step="0.01"')}${S(
              "Kategorie",
              "af-ing-category-" + i,
              [
                ["gemuese", "Gemüse / Früchte"],
                ["fleisch_fisch", "Fleisch / Fisch"],
                ["milch_ei", "Milch / Ei"],
                ["trockenes", "Beilage"],
                ["konserven", "Konserven"],
                ["gewuerze", "Gewürze"],
                ["oele_saucen", "Öl / Sauce"],
                ["sonstiges", "Sonstiges"],
              ],
              ing.category,
            )}${C.NUTRIENTS.map((k) => F(labels[k] + " pro 100 g", "af-ing-" + k + "-" + i, ing.nutritionPer100g?.[k], "number", 'min="0" step="0.01"')).join("")}${F("Alternativ: Salz (g) pro 100 g", "af-ing-salt-" + i, "", "number", 'min="0" step="0.01"')}${F("Packungsinhalt (g)", "af-ing-package-" + i, ing.packageGrams, "number", 'min="1"')}${F("Packungspreis (CHF)", "af-ing-price-" + i, ing.packagePriceCHF, "number", 'min="0" step="0.01"')}${F("Etikettquelle (optional)", "af-ing-source-" + i, ing.nutritionSource, "url")}</div>${N("Bei ml, EL, TL, Stück und Dose die tatsächlichen Gramm ergänzen. Salz wird mit Natrium = Salz ÷ 2,5 umgerechnet. Nicht bekannte Werte leer lassen.")}</details>`,
        )
        .join(
          "",
        )}${B("+ Zutat", "add-ingredient")}<h2>Kochschritte</h2>${editing.steps
        .map((step, i) =>
          K(
            "Schritt " + (i + 1),
            `${F("Anweisung", "af-step-text-" + i, step.text, "text", "required")}<div class="af-grid">${F("Gesamtdauer (Min.)", "af-step-time-" + i, step.timeMinutes, "number", 'min="0" required')}${F("Davon aktive Arbeit (Min.)", "af-step-active-" + i, step.activeMinutes ?? step.timeMinutes, "number", 'min="0" required')}${S(
              "Gerät",
              "af-step-device-" + i,
              ["Topf", "Pfanne", "Ofen", "Arbeitsplatte"].map((v) => [v, v]),
              step.device,
            )}</div>`,
          ),
        )
        .join(
          "",
        )}${B("+ Schritt", "add-step")}<label class="af-field">Hinweise zum Einfrieren und Aufwärmen<textarea id="af-edit-notes">${E((editing.notes || []).join("\n"))}</textarea></label><div class="af-toolbar"><button class="af-btn af-primary" type="submit">Rezept speichern</button>${B("Abbrechen", "cooking")}</div></form>`,
    );
  }
  function readEditor() {
    if (!editing) return;
    editing.name = A.val("af-edit-name");
    editing.servings = A.num("af-edit-servings");
    editing.freezable = A.checked("af-edit-freeze");
    editing.notes = A.val("af-edit-notes").split("\n").filter(Boolean);
    editing.ingredients = editing.ingredients.map((old, i) => {
      const nutrition = {};
      for (const k of C.NUTRIENTS)
        nutrition[k] = A.num("af-ing-" + k + "-" + i);
      const salt = A.num("af-ing-salt-" + i);
      if (salt !== null) nutrition.sodium_mg = C.round((salt / 2.5) * 1000, 0);
      return {
        ...old,
        name: A.val("af-ing-name-" + i),
        productName: A.val("af-ing-product-" + i),
        amount: A.num("af-ing-amount-" + i),
        unit: A.val("af-ing-unit-" + i),
        rawGrams: A.num("af-ing-raw-" + i) || undefined,
        category: A.val("af-ing-category-" + i),
        nutritionPer100g: nutrition,
        packageGrams: A.num("af-ing-package-" + i) || undefined,
        packagePriceCHF: A.num("af-ing-price-" + i),
        nutritionSource: A.val("af-ing-source-" + i),
        verifiedAt: todayISO(),
      };
    });
    editing.steps = editing.steps.map((old, i) => ({
      ...old,
      text: A.val("af-step-text-" + i),
      timeMinutes: A.num("af-step-time-" + i),
      activeMinutes: A.num("af-step-active-" + i),
      device: A.val("af-step-device-" + i),
      order: i + 1,
      shortLabel: "Schritt " + (i + 1),
      uses: (old.uses || []).filter((u) =>
        editing.ingredients.some((ing) => ing.id === u.ingredientId),
      ),
    }));
  }
  function saveEditor() {
    readEditor();
    const errors = C.validateRecipes({
      schemaVersion: "1.3",
      week: C.isoWeek(todayISO()),
      recipes: [editing],
    });
    if (errors.length) {
      showToast(errors[0]);
      return;
    }
    const ix = A.state.recipes.findIndex((r) => r.id === editing.id);
    if (ix >= 0) A.state.recipes[ix] = editing;
    else A.state.recipes.push(editing);
    save();
    showToast("Rezept gespeichert ✓");
    editing = null;
    render();
  }
  function showLibrary() {
    A.screen(
      "recipe-library",
      "Deine Rezepte",
      `${B("Rezept erstellen", "new-recipe")}${A.state.recipes.map((r) => K(E(r.name), `<p>${r.servings} Portionen · ${r.freezable ? "einfrierbar" : "nicht einfrierbar"}</p>${B("Bearbeiten", "edit-recipe", `data-id="${E(r.id)}"`)}`)).join("")}`,
    );
  }
  function exportRecipes() {
    if (!plan) return;
    const p = {
      schemaVersion: "1.3",
      week: C.isoWeek(plan.week),
      weekNote: plan.recipes
        .map((r) => r.name + ": " + r.servings + " Portionen")
        .join("; "),
      equipment: [
        { id: "topf", name: "Topf", qty: plan.equipment.Topf },
        { id: "pfanne", name: "Pfanne", qty: plan.equipment.Pfanne },
        { id: "ofen", name: "Ofen", qty: 1 },
      ],
      recipes: plan.recipes.map((r) => ({
        ...r,
        macrosPerServing: C.recipeNutrition(r).perServing || r.macrosPerServing,
      })),
    };
    const errors = C.validateRecipes(p);
    if (errors.length) {
      showToast(errors[0]);
      return;
    }
    A.download("AlexFit-" + p.week + "-recipes.json", p);
  }
  function copyRecipe(i) {
    const r = recipesForPlan()[i];
    if (!r) return;
    const n = C.recipeNutrition(r);
    A.copy(
      [
        r.name,
        r.servings + " Portionen",
        "Gesamtgewicht: " +
          (n.finishedWeightG
            ? n.finishedWeightG +
              " g (" +
              (n.weightMeasured ? "gewogen" : "geschätzt") +
              ")"
            : "noch wiegen"),
        "Portionsgewicht: " +
          (n.portionWeightG ? n.portionWeightG + " g" : "offen"),
        "Pro Portion: " + nutrientText(n.perServing),
        "Pro 100 g: " + nutrientText(n.per100g),
        "Zutaten: " +
          r.ingredients
            .map((i) => `${i.amount} ${i.unit} ${i.productName || i.name}`)
            .join("; "),
        "Nährwerte aus Zutatenmengen. Bei abweichenden Produkten Etikettwerte anpassen.",
      ].join("\n"),
    );
  }
  A.renderCooking = render;
  const oldAction = A.handleAction;
  A.handleAction = (action, t) => {
    const map = {
      "new-recipe": newRecipe,
      "recipe-library": showLibrary,
      "edit-recipe": () => {
        editing = structuredClone(
          A.state.recipes.find((r) => r.id === t.dataset.id),
        );
        renderEditor();
      },
      "add-ingredient": () => {
        readEditor();
        editing.ingredients.push({
          id: editing.id + "-ing-" + A.uid().slice(0, 8),
          name: "",
          amount: 100,
          unit: "g",
          category: "sonstiges",
          nutritionPer100g: {},
        });
        renderEditor();
      },
      "add-step": () => {
        readEditor();
        editing.steps.push({
          id: editing.id + "-s-" + A.uid().slice(0, 8),
          recipeId: editing.id,
          order: editing.steps.length + 1,
          text: "",
          timeMinutes: 10,
          activeMinutes: 10,
          device: "Pfanne",
          uses: [],
        });
        renderEditor();
      },
      "import-recipes": () =>
        document.getElementById("af-recipe-import")?.click(),
      "copy-recipe": () => copyRecipe(Number(t.dataset.index)),
      "export-recipes": exportRecipes,
      "export-shopping": () =>
        A.download("AlexFit-" + plan.week + "-einkaufsliste.json", {
          week: plan.week,
          items: shoppingList().map((i) => ({
            name: i.name,
            amount: i.amount + i.unit,
            category: i.category,
          })),
        }),
      "print-cooking": () => window.print(),
    };
    if (map[action]) map[action]();
    else oldAction?.(action, t);
  };
  const oldForm = A.handleForm;
  A.handleForm = (type, form) => {
    if (type === "cook-plan") compilePlan();
    else if (type === "recipe-editor") saveEditor();
    else if (type === "cooked-weight") {
      const i = Number(form.dataset.index),
        g = A.num("af-finished-" + i);
      if (g > 0) {
        plan.recipes[i].finishedWeightG = g;
        plan.recipes[i].weightMeasured = true;
        save();
        render();
      }
    } else if (type === "cook-extra") {
      plan.extras.push({
        id: A.uid(),
        name: A.val("af-extra-name"),
        amount: A.num("af-extra-amount"),
        unit: A.val("af-extra-unit"),
        packageGrams: A.num("af-extra-package"),
        packagePriceCHF: A.num("af-extra-price"),
        shoppingCategory: A.val("af-extra-category"),
      });
      save();
      render();
    } else oldForm?.(type, form);
  };
})();
