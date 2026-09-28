(() => {
  const POLL_MS = 4000;

  let categories = [];
  let colors = [];
  let items = [];
  let recents = [];
  let view = "list"; // "list" | "shopping"
  let pollTimer = null;
  let editingItemId = null; // which list row is currently in edit mode
  let shoppingSearchTerm = "";
  // What the household has taught the categorizer: normalized name -> category
  const learnedTerms = new Map();

  const el = {
    addForm: document.getElementById("add-form"),
    itemName: document.getElementById("item-name"),
    itemCategory: document.getElementById("item-category"),
    itemQty: document.getElementById("item-qty"),
    categoryHint: document.getElementById("category-hint"),
    voiceBtn: document.getElementById("voice-btn"),
    voiceLang: document.getElementById("voice-lang"),
    yourName: document.getElementById("your-name"),
    statusMsg: document.getElementById("status-msg"),
    emptyState: document.getElementById("empty-state"),
    groups: document.getElementById("groups"),
    startShopping: document.getElementById("start-shopping"),
    shareWhatsapp: document.getElementById("share-whatsapp"),
    colorPicker: document.getElementById("color-picker"),
    recentSection: document.getElementById("recent-section"),
    recentChips: document.getElementById("recent-chips"),

    listView: document.getElementById("list-view"),
    shoppingView: document.getElementById("shopping-view"),
    shoppingGroups: document.getElementById("shopping-groups"),
    shoppingSearch: document.getElementById("shopping-search"),
    shoppingNoResults: document.getElementById("shopping-no-results"),
    backBtn: document.getElementById("back-btn"),
    finishShopping: document.getElementById("finish-shopping"),
    progressCount: document.getElementById("progress-count"),
    progressFill: document.getElementById("progress-fill"),
  };

  // ---------- Auto-categorization ----------
  // A small keyword dictionary for guessing a category from an item name,
  // in both English and Arabic. Deliberately simple and local (no API
  // call per keystroke): each category maps to words/phrases that
  // reliably belong to it. Longer, more specific phrases win over shorter
  // ones so e.g. "peanut butter" / "زبدة الفول السوداني" (Pantry) isn't
  // confused by the stray single-word "butter" / "زبدة" rule (Dairy).
  const CATEGORY_KEYWORDS = {
    "Produce": [
      "apple", "banana", "orange", "grape", "lemon", "lime", "lettuce",
      "spinach", "kale", "carrot", "potato", "sweet potato", "onion",
      "garlic", "tomato", "cucumber", "bell pepper", "hot pepper",
      "jalapeno", "eggplant", "broccoli", "cauliflower", "celery",
      "mushroom", "avocado", "strawberry", "blueberry", "raspberry",
      "blackberry", "melon", "watermelon", "pineapple", "mango", "peach",
      "pear", "plum", "cherry", "corn", "zucchini", "squash", "cabbage",
      "radish", "beet", "asparagus", "green bean", "ginger", "cilantro",
      "parsley", "basil", "scallion", "leek", "herbs", "vegetable", "fruit",
      // Arabic (MSA + common Levantine/Jordanian usage)
      "تفاح", "موز", "برتقال", "عنب", "ليمون", "خس", "سبانخ", "جزر",
      "بطاطا", "بطاطس", "بصل", "ثوم", "طماطم", "بندورة", "خيار",
      "فلفل حلو", "فلفل حار", "باذنجان", "بروكلي", "قرنبيط", "كرفس",
      "فطر", "أفوكادو", "فراولة", "بطيخ", "شمام", "أناناس", "مانجو",
      "خوخ", "كمثرى", "كرز", "برقوق", "ذرة", "كوسا", "ملفوف", "فجل",
      "شمندر", "هليون", "فاصولياء خضراء", "زنجبيل", "كزبرة", "بقدونس",
      "ريحان", "بصل أخضر", "كراث", "خضار", "فواكه",
    ],
    "Bakery": [
      "bread", "bagel", "bun", "roll", "croissant", "muffin", "donut",
      "doughnut", "tortilla", "pita", "baguette", "biscuit", "pastry",
      // Arabic
      "خبز", "كعك", "معجنات", "كرواسون", "دونات", "رغيف",
    ],
    "Dairy & Eggs": [
      "egg", "milk", "cheese", "yogurt", "yoghurt", "butter", "cream",
      "sour cream", "cottage cheese", "half and half", "creamer",
      "margarine", "mozzarella", "cheddar",
      // Arabic
      "بيض", "حليب", "جبنة", "جبن", "لبن", "زبادي", "لبنة", "زبدة",
      "قشطة", "كريمة", "سمنة", "مارجرين",
    ],
    "Meat & Seafood": [
      "chicken", "beef", "pork", "turkey", "bacon", "sausage", "ham",
      "steak", "ground beef", "lamb", "fish", "salmon", "tuna", "shrimp",
      "crab", "lobster", "seafood", "meatball", "hot dog", "deli meat",
      // Arabic
      "دجاج", "لحم", "لحمة", "سمك", "تونة", "سلمون", "جمبري", "روبيان",
      "نقانق", "سجق", "ديك رومي", "كبدة", "لحم بقر", "لحم غنم",
      "لحم خروف", "لحم مفروم", "مرتديلا", "بسطرمة", "بيكون",
    ],
    "Pantry & Dry Goods": [
      "rice", "pasta", "noodle", "flour", "sugar", "salt", "cereal",
      "oats", "oatmeal", "bean", "lentil", "canned", "soup", "ketchup",
      "mustard", "mayo", "mayonnaise", "cooking oil", "olive oil",
      "vinegar", "honey", "peanut butter", "jam", "jelly", "spice",
      "broth", "stock", "tomato sauce", "tomato paste", "baking powder",
      "baking soda", "yeast", "black pepper",
      // Arabic
      "أرز", "مكرونة", "معكرونة", "شعيرية", "طحين", "دقيق", "سكر",
      "ملح", "شوفان", "فول", "عدس", "حمص", "معلبات", "شوربة", "كاتشب",
      "خردل", "مايونيز", "زيت", "زيت الزيتون", "خل", "عسل", "مربى",
      "بهارات", "مرقة", "خميرة", "صودا الخبز", "بيكنج باودر",
      "فلفل أسود", "صلصة طماطم", "معجون طماطم", "زبدة الفول السوداني",
    ],
    "Frozen": [
      "frozen", "ice cream", "popsicle", "frozen pizza", "frozen meal",
      "waffle", "tv dinner", "ice pop",
      // Arabic
      "مجمد", "بوظة", "ايس كريم", "بيتزا مجمدة", "وافل",
    ],
    "Beverages": [
      "water", "soda", "juice", "coffee", "tea", "beer", "wine",
      "almond milk", "soy milk", "oat milk", "energy drink",
      "sparkling water", "lemonade", "kombucha",
      // Arabic
      "ماء", "مي", "عصير", "قهوة", "شاي", "بيرة", "نبيذ", "كولا",
      "مشروب غازي", "مشروب طاقة", "مياه غازية", "ليموناضة",
      "حليب اللوز", "حليب الصويا",
    ],
    "Snacks": [
      "chip", "cracker", "cookie", "candy", "chocolate", "popcorn",
      "pretzel", "nuts", "granola bar", "trail mix",
      // Arabic
      "شيبس", "بسكويت", "كوكيز", "حلويات", "شوكولاتة", "فشار",
      "مقرمشات", "مكسرات", "جرانولا",
    ],
    "Household & Cleaning": [
      "detergent", "dish soap", "paper towel", "toilet paper",
      "trash bag", "garbage bag", "cleaner", "bleach", "sponge",
      "napkin", "aluminum foil", "plastic wrap", "ziploc", "laundry",
      "dishwasher pod", "air freshener",
      // Arabic
      "منظف", "مبيض", "كلور", "اسفنجة", "فويل", "ورق المنيوم",
      "نايلون", "اكياس تجميد", "مسحوق غسيل", "معطر جو",
      "سائل غسيل الصحون", "مناديل ورقية", "ورق تواليت", "كيس زبالة",
      "كيس قمامة",
    ],
    "Personal Care": [
      "shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant",
      "lotion", "razor", "floss", "sunscreen", "tissue", "cotton swab",
      "soap bar", "hand soap",
      // Arabic
      "شامبو", "بلسم", "معجون اسنان", "فرشاة اسنان", "مزيل عرق",
      "كريم مرطب", "شفرة حلاقة", "خيط اسنان", "واقي شمس", "كلينكس",
      "اعواد قطنية", "صابون استحمام",
    ],
  };

  // Unicode-aware: pulls out words in any script (Latin, Arabic, ...).
  function tokenize(str) {
    return str.match(/[\p{L}]+/gu) || [];
  }

  function isArabic(word) {
    return /[\u0600-\u06FF]/.test(word);
  }

  // Light Arabic normalization so common spelling variants still match:
  // strips diacritics/tatweel, folds alef/alef-maksura/ta-marbuta variants,
  // and drops a leading "ال" (the definite article) so "التفاح" matches
  // the dictionary entry "تفاح".
  function normalizeArabic(word) {
    let w = word
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "") // diacritics + tatweel
      .replace(/[إأآا]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه");
    if (w.startsWith("ال") && w.length > 3) w = w.slice(2);
    return w;
  }

  // Normalizes one word from the dictionary (Arabic or English) so it can
  // be compared against normalized input tokens on equal footing.
  function normalizeKeywordWord(word) {
    return isArabic(word) ? normalizeArabic(word) : word.toLowerCase();
  }

  // Naive English plural handling: "apples" -> also try "apple",
  // "tomatoes" -> "tomato", "berries" -> "berry". Harmless if a variant
  // doesn't match anything real. Arabic plurals are irregular, so for
  // Arabic we just normalize rather than guess a stem.
  function stemVariants(token) {
    const variants = new Set([token]);
    if (token.endsWith("ies") && token.length > 4) {
      variants.add(token.slice(0, -3) + "y");
    }
    if (token.endsWith("es") && token.length > 3) {
      variants.add(token.slice(0, -2));
    }
    if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
      variants.add(token.slice(0, -1));
    }
    return [...variants];
  }

  // All the forms a single input token could reasonably match against.
  function tokenVariants(token) {
    return isArabic(token)
      ? new Set([normalizeArabic(token)])
      : new Set(stemVariants(token.toLowerCase()));
  }

  // Returns a category name if confident, or null if the name is unknown
  // or ambiguous (matches more than one category equally well) — in either
  // case the caller should ask the person instead of guessing.
  function detectCategory(rawName) {
    const name = rawName.trim();
    if (!name) return null;

    const tokens = tokenize(name);
    if (tokens.length === 0) return null;

    const variantsByPosition = tokens.map(tokenVariants);
    const expandedTokens = new Set();
    for (const variants of variantsByPosition) {
      for (const v of variants) expandedTokens.add(v);
    }

    const matches = []; // { category, weight }
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      for (const keyword of keywords) {
        const kwWords = keyword.split(" ").map(normalizeKeywordWord);

        if (kwWords.length === 1) {
          if (expandedTokens.has(kwWords[0])) {
            matches.push({ category, weight: keyword.length });
          }
          continue;
        }

        // Multi-word phrase: slide the phrase across the input tokens and
        // check each position matches (word-by-word, using that token's
        // normalized variants). Token-based rather than a regex, since
        // regex "\b" word boundaries don't work reliably across scripts
        // like Arabic.
        for (let i = 0; i + kwWords.length <= tokens.length; i++) {
          let allMatch = true;
          for (let j = 0; j < kwWords.length; j++) {
            if (!variantsByPosition[i + j].has(kwWords[j])) {
              allMatch = false;
              break;
            }
          }
          if (allMatch) {
            matches.push({ category, weight: keyword.length + 5 }); // phrases are more specific
            break;
          }
        }
      }
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => b.weight - a.weight);
    const topWeight = matches[0].weight;
    const topCategories = new Set(
      matches.filter((m) => m.weight === topWeight).map((m) => m.category)
    );

    return topCategories.size === 1 ? [...topCategories][0] : null;
  }

  let categoryChosenManually = false;

  function setCategoryHint(text, kind) {
    el.categoryHint.textContent = text || "";
    el.categoryHint.className = "category-hint" + (kind ? ` is-${kind}` : "");
  }

  // ---------- Teaching the categorizer ----------
  // Canonical key for an item name: lowercase Latin words, normalized Arabic
  // words, joined by single spaces. "Nutella", "nutella " and "NUTELLA"
  // all share one key; so do "الحليب" and "حليب".
  function normalizeItemName(name) {
    return tokenize(name).map(normalizeKeywordWord).join(" ");
  }

  // Household-taught answers win over the built-in dictionary, so people
  // can also correct a wrong guess for good.
  function lookupCategory(name) {
    const learned = learnedTerms.get(normalizeItemName(name));
    if (learned && categories.includes(learned)) {
      return { category: learned, source: "learned" };
    }
    const guess = detectCategory(name);
    return guess ? { category: guess, source: "dictionary" } : null;
  }

  async function loadLearned() {
    try {
      const rows = await api("/api/learned");
      learnedTerms.clear();
      for (const r of rows) learnedTerms.set(r.term, r.category);
    } catch (err) {
      // Non-critical: the built-in dictionary still works without it.
    }
  }

  // Remember (or correct) which category an item name belongs to.
  async function teachCategory(name, category) {
    const term = normalizeItemName(name);
    if (!term || !category) return;
    const existing = learnedTerms.get(term);
    if (existing === category) return; // already known
    // Nothing new to learn if the built-in dictionary already agrees.
    if (existing === undefined && detectCategory(name) === category) return;
    learnedTerms.set(term, category); // optimistic, so it applies immediately
    try {
      await api("/api/learn", {
        method: "POST",
        body: JSON.stringify({ term, category }),
      });
    } catch (err) {
      // Not worth interrupting the person over; it just won't persist.
    }
  }

  function runAutoCategorize() {
    const name = el.itemName.value.trim();
    if (categoryChosenManually) return; // respect the person's own pick
    if (!name) {
      el.itemCategory.value = "";
      setCategoryHint("");
      return;
    }
    const found = lookupCategory(name);
    if (found) {
      el.itemCategory.value = found.category;
      setCategoryHint(
        found.source === "learned"
          ? `Remembered from before: ${found.category} (tap to change)`
          : `Auto-detected: ${found.category} (tap to change)`,
        "auto"
      );
    } else {
      el.itemCategory.value = "";
      setCategoryHint(`Not sure what type of item "${name}" is — please choose a category.`, "unsure");
    }
  }

  let autoCategorizeTimer = null;
  el.itemName.addEventListener("input", () => {
    clearTimeout(autoCategorizeTimer);
    autoCategorizeTimer = setTimeout(runAutoCategorize, 250);
  });

  el.itemCategory.addEventListener("change", () => {
    categoryChosenManually = true;
    setCategoryHint("");
  });

  function resetCategoryPicker() {
    categoryChosenManually = false;
    el.itemCategory.value = "";
    setCategoryHint("");
  }

  // ---------- Persisted "your name" + color tag ----------
  el.yourName.value = localStorage.getItem("grocery.yourName") || "";
  el.yourName.addEventListener("input", () => {
    localStorage.setItem("grocery.yourName", el.yourName.value.trim());
  });

  function getYourColor() {
    return localStorage.getItem("grocery.yourColor") || (colors[0] && colors[0].hex) || null;
  }

  function setYourColor(hex) {
    localStorage.setItem("grocery.yourColor", hex);
    renderColorPicker();
  }

  function renderColorPicker() {
    const current = getYourColor();
    el.colorPicker.innerHTML = colors.map((c) => `
      <button type="button" class="color-swatch ${c.hex === current ? "is-selected" : ""}"
        style="background:${safeHex(c.hex)}" data-color="${safeHex(c.hex)}"
        aria-label="${escapeHtml(c.name)}" title="${escapeHtml(c.name)}"></button>
    `).join("");
  }

  el.colorPicker.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-color]");
    if (!btn) return;
    setYourColor(btn.getAttribute("data-color"));
  });

  // Defense in depth: only ever paint a color that matches this exact
  // pattern, even though the server already restricts values to its palette.
  function safeHex(hex) {
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#999999";
  }

  // ---------- API helpers ----------
  async function api(path, options) {
    const res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Something went wrong.");
    }
    if (res.status === 204) return null;
    return res.json();
  }

  function showStatus(message) {
    el.statusMsg.textContent = message || "";
    if (message) {
      setTimeout(() => {
        if (el.statusMsg.textContent === message) el.statusMsg.textContent = "";
      }, 4000);
    }
  }

  // ---------- Loading data ----------
  async function loadCategories() {
    categories = await api("/api/categories");
    const options = categories
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
    el.itemCategory.innerHTML =
      `<option value="" disabled selected>Choose a category…</option>` + options;
  }

  async function loadColors() {
    colors = await api("/api/colors");
    renderColorPicker();
  }

  async function loadRecents() {
    try {
      recents = await api("/api/recent");
      renderRecents();
    } catch (err) {
      // Non-critical — fail quietly and just hide the section.
      recents = [];
      renderRecents();
    }
  }

  function renderRecents() {
    el.recentSection.hidden = recents.length === 0;
    el.recentChips.innerHTML = recents.map((r, i) => `
      <button type="button" class="recent-chip" data-recent-index="${i}" dir="auto">${escapeHtml(r.name)}</button>
    `).join("");
  }

  el.recentChips.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-recent-index]");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-recent-index"));
    const recent = recents[idx];
    if (!recent) return;
    btn.disabled = true;
    try {
      const created = await api("/api/items", {
        method: "POST",
        body: JSON.stringify({
          name: recent.name,
          category: recent.category,
          quantity: "",
          added_by: el.yourName.value.trim(),
          added_by_color: getYourColor(),
        }),
      });
      items.push(created);
      renderListView();
      recents = recents.filter((_, i) => i !== idx);
      renderRecents();
    } catch (err) {
      showStatus(err.message);
      btn.disabled = false;
    }
  });

  async function loadItems({ silent } = {}) {
    try {
      const fresh = await api("/api/items");
      items = fresh;
      render();
    } catch (err) {
      if (!silent) showStatus(err.message);
    }
  }

  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => loadItems({ silent: true }), POLL_MS);
  }

  // ---------- Grouping ----------
  function groupByCategory(list) {
    const byCat = new Map();
    for (const item of list) {
      if (!byCat.has(item.category)) byCat.set(item.category, []);
      byCat.get(item.category).push(item);
    }
    // Preserve store-layout order from `categories`, then any leftovers.
    const ordered = [];
    for (const c of categories) {
      if (byCat.has(c)) ordered.push([c, byCat.get(c)]);
    }
    for (const [c, list2] of byCat) {
      if (!categories.includes(c)) ordered.push([c, list2]);
    }
    return ordered;
  }

  function personTag(item) {
    const hex = item.added_by_color ? safeHex(item.added_by_color) : null;
    const dot = hex ? `<span class="person-dot" style="background:${hex}"></span>` : "";
    const nameStyle = hex ? ` style="color:${hex}"` : "";
    return `${dot}<span class="person-name"${nameStyle}>${escapeHtml(item.added_by)}</span>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[ch]));
  }

  // ---------- Rendering: list view ----------
  let editDraft = null; // in-progress values for the row being edited

  function categoryOptionsHtml(selected) {
    const all = categories.includes(selected) || !selected
      ? categories
      : [...categories, selected]; // keep an unknown/legacy category selectable
    return all
      .map((c) => `<option value="${escapeHtml(c)}" ${c === selected ? "selected" : ""}>${escapeHtml(c)}</option>`)
      .join("");
  }

  function renderItemRow(item) {
    if (editingItemId !== null && String(item.id) === String(editingItemId) && editDraft) {
      return `
        <div class="item-row is-editing" data-id="${item.id}">
          <div class="item-edit-fields">
            <input type="text" class="edit-name" value="${escapeHtml(editDraft.name)}" maxlength="80" dir="auto" aria-label="Item name" />
            <div class="edit-row-2">
              <select class="edit-category" aria-label="Category">${categoryOptionsHtml(editDraft.category)}</select>
              <input type="text" class="edit-qty" value="${escapeHtml(editDraft.quantity)}" maxlength="20" placeholder="qty" aria-label="Quantity" />
            </div>
          </div>
          <div class="item-actions">
            <button type="button" class="edit-save" data-save="${item.id}" aria-label="Save changes">&#10003;</button>
            <button type="button" class="edit-cancel" data-cancel="${item.id}" aria-label="Cancel editing">&times;</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="item-row" data-id="${item.id}">
        <div class="item-main" title="Tap to edit">
          <div class="item-name" dir="auto">${escapeHtml(item.name)}</div>
          ${(item.quantity || item.added_by) ? `
            <div class="item-meta">
              ${item.quantity ? escapeHtml(item.quantity) : ""}
              ${item.quantity && item.added_by ? " · " : ""}
              ${item.added_by ? personTag(item) : ""}
            </div>` : ""}
        </div>
        <div class="item-actions">
          <button class="item-edit-btn" data-edit="${item.id}" aria-label="Edit ${escapeHtml(item.name)}">&#9998;</button>
          <button class="item-remove" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">&times;</button>
        </div>
      </div>
    `;
  }

  function renderListView() {
    el.emptyState.hidden = items.length !== 0;
    el.startShopping.disabled = items.length === 0;
    el.shareWhatsapp.disabled = items.length === 0;

    const groups = groupByCategory(items);
    el.groups.innerHTML = groups.map(([category, list]) => `
      <div class="category-group">
        <p class="category-title">${escapeHtml(category)}</p>
        ${list.map(renderItemRow).join("")}
      </div>
    `).join("");
  }

  // ---------- Edit in place ----------
  function startEditing(id) {
    const item = items.find((i) => String(i.id) === String(id));
    if (!item) return;
    editingItemId = item.id;
    editDraft = {
      name: item.name,
      category: item.category,
      quantity: item.quantity || "",
    };
    renderListView();
    const input = el.groups.querySelector(".item-row.is-editing .edit-name");
    if (input) input.focus();
  }

  function stopEditing() {
    editingItemId = null;
    editDraft = null;
    renderListView();
  }

  async function saveEdit(id) {
    const row = el.groups.querySelector(`.item-row.is-editing[data-id="${id}"]`);
    const item = items.find((i) => String(i.id) === String(id));
    if (!row || !item) {
      stopEditing();
      return;
    }
    const name = row.querySelector(".edit-name").value.trim();
    const category = row.querySelector(".edit-category").value;
    const quantity = row.querySelector(".edit-qty").value.trim();

    if (!name) {
      showStatus("An item needs a name.");
      return;
    }

    const categoryChanged = category !== item.category;

    // Optimistic update, then leave edit mode.
    item.name = name;
    item.category = category;
    item.quantity = quantity;
    editingItemId = null;
    editDraft = null;
    renderListView();

    try {
      await api(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, category, quantity }),
      });
      // Changing the category by hand is a correction worth remembering.
      if (categoryChanged) teachCategory(name, category);
      loadRecents();
    } catch (err) {
      showStatus(err.message);
      loadItems();
    }
  }

  function syncDraftFromRow(target) {
    const row = target.closest && target.closest(".item-row.is-editing");
    if (!row || !editDraft) return;
    editDraft = {
      name: row.querySelector(".edit-name").value,
      category: row.querySelector(".edit-category").value,
      quantity: row.querySelector(".edit-qty").value,
    };
  }

  el.groups.addEventListener("input", (e) => syncDraftFromRow(e.target));
  el.groups.addEventListener("change", (e) => syncDraftFromRow(e.target));

  el.groups.addEventListener("keydown", (e) => {
    if (e.isComposing || !e.target.closest(".item-row.is-editing")) return;
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit(editingItemId);
    } else if (e.key === "Escape") {
      stopEditing();
    }
  });

  el.groups.addEventListener("click", async (e) => {
    const removeBtn = e.target.closest("[data-remove]");
    if (removeBtn) {
      const id = removeBtn.getAttribute("data-remove");
      if (String(editingItemId) === String(id)) {
        editingItemId = null;
        editDraft = null;
      }
      items = items.filter((i) => String(i.id) !== String(id)); // optimistic
      renderListView();
      try {
        await api(`/api/items/${id}`, { method: "DELETE" });
        loadRecents();
      } catch (err) {
        showStatus(err.message);
        loadItems();
      }
      return;
    }

    const saveBtn = e.target.closest("[data-save]");
    if (saveBtn) {
      await saveEdit(saveBtn.getAttribute("data-save"));
      return;
    }

    if (e.target.closest("[data-cancel]")) {
      stopEditing();
      return;
    }

    // Tap the pencil, or the item's text itself, to edit.
    const editBtn = e.target.closest("[data-edit]");
    const textArea = e.target.closest(".item-row:not(.is-editing) .item-main");
    if (editBtn || textArea) {
      const id = editBtn
        ? editBtn.getAttribute("data-edit")
        : textArea.closest(".item-row").getAttribute("data-id");
      startEditing(id);
    }
  });

  // ---------- Rendering: shopping view ----------
  // Search matches on the raw text and on the Arabic/English-normalized
  // form, so typing "تفاح" finds "التفاح" and "app" finds "Apples".
  function itemMatchesSearch(item, term) {
    const raw = term.trim().toLowerCase();
    if (!raw) return true;
    if (item.name.toLowerCase().includes(raw)) return true;
    const q = normalizeItemName(term);
    return q !== "" && normalizeItemName(item.name).includes(q);
  }

  function renderShoppingView() {
    // Progress always reflects the whole trip, even while a search narrows
    // what's visible.
    const total = items.length;
    const checkedCount = items.filter((i) => i.checked).length;

    el.progressCount.textContent = `${checkedCount} / ${total}`;
    el.progressFill.style.width = total ? `${(checkedCount / total) * 100}%` : "0%";
    document.getElementById("progress-bar").setAttribute("aria-valuenow", total ? Math.round((checkedCount / total) * 100) : 0);

    const searching = shoppingSearchTerm.trim() !== "";
    const visible = searching
      ? items.filter((i) => itemMatchesSearch(i, shoppingSearchTerm))
      : items;
    el.shoppingNoResults.hidden = !(searching && visible.length === 0);

    const groups = groupByCategory(visible);
    el.shoppingGroups.innerHTML = groups.map(([category, list]) => `
      <div class="category-group">
        <p class="category-title">${escapeHtml(category)}</p>
        ${list.map((item) => `
          <button type="button" class="shop-item ${item.checked ? "is-checked" : ""}" data-toggle="${item.id}">
            <span class="shop-checkbox">${item.checked ? "&#10003;" : ""}</span>
            <span class="shop-item-main">
              <span class="shop-item-name" dir="auto">${escapeHtml(item.name)}</span>
              ${(item.quantity || item.added_by) ? `
                <span class="shop-item-meta">
                  ${item.quantity ? escapeHtml(item.quantity) : ""}
                  ${item.quantity && item.added_by ? " · " : ""}
                  ${item.added_by ? personTag(item) : ""}
                </span>` : ""}
            </span>
          </button>
        `).join("")}
      </div>
    `).join("");
  }

  el.shoppingSearch.addEventListener("input", () => {
    shoppingSearchTerm = el.shoppingSearch.value;
    renderShoppingView();
  });

  function clearShoppingSearch() {
    shoppingSearchTerm = "";
    el.shoppingSearch.value = "";
  }

  el.shoppingGroups.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-toggle]");
    if (!btn) return;
    const id = btn.getAttribute("data-toggle");
    const item = items.find((i) => String(i.id) === String(id));
    if (!item) return;
    item.checked = !item.checked; // optimistic
    renderShoppingView();
    try {
      await api(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ checked: item.checked }),
      });
    } catch (err) {
      item.checked = !item.checked; // revert
      renderShoppingView();
      showStatus(err.message);
    }
  });

  // ---------- View switching ----------
  function render() {
    if (view === "list") {
      // Polling shouldn't wipe out a row someone is in the middle of editing.
      if (editingItemId !== null) return;
      renderListView();
    } else {
      renderShoppingView();
    }
  }

  el.startShopping.addEventListener("click", () => {
    editingItemId = null;
    editDraft = null;
    clearShoppingSearch();
    view = "shopping";
    el.listView.hidden = true;
    el.shoppingView.hidden = false;
    window.scrollTo(0, 0);
    render();
  });

  el.backBtn.addEventListener("click", () => {
    clearShoppingSearch();
    view = "list";
    el.shoppingView.hidden = true;
    el.listView.hidden = false;
    window.scrollTo(0, 0);
    render();
  });

  el.finishShopping.addEventListener("click", async () => {
    const checkedCount = items.filter((i) => i.checked).length;
    if (checkedCount === 0) {
      showStatus("Check off at least one item before finishing.");
      return;
    }
    const ok = window.confirm(
      `Finish shopping and clear ${checkedCount} checked item${checkedCount === 1 ? "" : "s"} from the list?`
    );
    if (!ok) return;
    try {
      await api("/api/shopping/finish", { method: "POST" });
      clearShoppingSearch();
      view = "list";
      el.shoppingView.hidden = true;
      el.listView.hidden = false;
      await loadItems();
      await loadRecents();
    } catch (err) {
      showStatus(err.message);
    }
  });

  // ---------- Add item ----------
  el.addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.itemName.value.trim();
    if (!name) return;

    if (!el.itemCategory.value) {
      setCategoryHint(`Not sure what type of item "${name}" is — please choose a category.`, "unsure");
      el.itemCategory.focus();
      return;
    }

    const payload = {
      name,
      category: el.itemCategory.value,
      quantity: el.itemQty.value.trim(),
      added_by: el.yourName.value.trim(),
      added_by_color: getYourColor(),
    };
    const pickedManually = categoryChosenManually;
    el.itemName.value = "";
    el.itemQty.value = "";
    resetCategoryPicker();
    el.itemName.focus();
    try {
      const created = await api("/api/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      items.push(created);
      renderListView();
      loadRecents();
      // If the person chose the category themselves (because we were unsure,
      // or because they corrected our guess), remember it for next time.
      if (pickedManually) teachCategory(name, payload.category);
    } catch (err) {
      showStatus(err.message);
    }
  });

  // ---------- Voice input ----------
  // Uses the browser's built-in speech recognition (no server or API key).
  // Supported in Chrome/Edge/Android and recent Safari; hidden elsewhere.
  const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
  const VOICE_LANGS = {
    en: { code: "en-US", label: "EN", title: "Listening in English (tap to switch to Arabic)" },
    ar: { code: "ar-JO", label: "ع", title: "Listening in Arabic (tap to switch to English)" },
  };
  let voiceLangKey = localStorage.getItem("grocery.voiceLang");
  if (!VOICE_LANGS[voiceLangKey]) {
    voiceLangKey = (navigator.language || "").toLowerCase().startsWith("ar") ? "ar" : "en";
  }
  let recognition = null;

  function updateVoiceLangButton() {
    const lang = VOICE_LANGS[voiceLangKey];
    el.voiceLang.textContent = lang.label;
    el.voiceLang.title = lang.title;
    el.voiceLang.setAttribute("aria-label", lang.title);
  }

  if (SpeechRecognitionImpl) {
    el.voiceBtn.hidden = false;
    el.voiceLang.hidden = false;
    updateVoiceLangButton();

    el.voiceLang.addEventListener("click", () => {
      voiceLangKey = voiceLangKey === "en" ? "ar" : "en";
      localStorage.setItem("grocery.voiceLang", voiceLangKey);
      updateVoiceLangButton();
      if (recognition) recognition.stop();
    });

    el.voiceBtn.addEventListener("click", () => {
      if (recognition) {
        recognition.stop(); // tap again to stop early
        return;
      }
      const r = new SpeechRecognitionImpl();
      r.lang = VOICE_LANGS[voiceLangKey].code;
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.continuous = false;

      r.onstart = () => {
        el.voiceBtn.classList.add("is-listening");
        el.voiceBtn.setAttribute("aria-pressed", "true");
      };
      r.onresult = (event) => {
        const heard = event.results[0][0].transcript
          .trim()
          .replace(/[.。،!؟?]+$/, "")
          .slice(0, 80);
        if (!heard) return;
        el.itemName.value = heard;
        clearTimeout(autoCategorizeTimer);
        runAutoCategorize(); // same path as typing: detect, or ask
      };
      r.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          showStatus("Microphone access is blocked. Allow it in your browser settings to use voice.");
        } else if (event.error === "no-speech") {
          showStatus("Didn't catch that — tap the mic and try again.");
        } else if (event.error !== "aborted") {
          showStatus("Voice input isn't available right now.");
        }
      };
      r.onend = () => {
        el.voiceBtn.classList.remove("is-listening");
        el.voiceBtn.setAttribute("aria-pressed", "false");
        recognition = null;
      };

      recognition = r;
      try {
        r.start();
      } catch (err) {
        recognition = null;
      }
    });
  }

  // ---------- Share via WhatsApp ----------
  // Shares what's still left to buy (anything already checked off during a
  // trip is in the cart, so it's left out), grouped by store section.
  function buildShareText() {
    const remaining = items.filter((i) => !i.checked);
    const lines = ["🛒 *Grocery list*", ""];
    for (const [category, list] of groupByCategory(remaining)) {
      lines.push(`*${category}*`);
      for (const item of list) {
        lines.push(`• ${item.name}${item.quantity ? ` (${item.quantity})` : ""}`);
      }
      lines.push("");
    }
    return lines.join("\n").trim();
  }

  el.shareWhatsapp.addEventListener("click", () => {
    if (items.filter((i) => !i.checked).length === 0) {
      showStatus("Everything on the list is already checked off.");
      return;
    }
    const url = "https://wa.me/?text=" + encodeURIComponent(buildShareText());
    window.open(url, "_blank", "noopener");
  });

  // ---------- Boot ----------
  (async function init() {
    await loadCategories();
    await loadColors();
    await loadLearned();
    await loadItems();
    await loadRecents();
    startPolling();
  })();
})();
