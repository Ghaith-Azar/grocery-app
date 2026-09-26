(() => {
  const POLL_MS = 4000;

  let categories = [];
  let colors = [];
  let items = [];
  let recents = [];
  let view = "list"; // "list" | "shopping"
  let pollTimer = null;

  const el = {
    addForm: document.getElementById("add-form"),
    itemName: document.getElementById("item-name"),
    itemCategory: document.getElementById("item-category"),
    itemQty: document.getElementById("item-qty"),
    yourName: document.getElementById("your-name"),
    statusMsg: document.getElementById("status-msg"),
    emptyState: document.getElementById("empty-state"),
    groups: document.getElementById("groups"),
    startShopping: document.getElementById("start-shopping"),
    colorPicker: document.getElementById("color-picker"),
    recentSection: document.getElementById("recent-section"),
    recentChips: document.getElementById("recent-chips"),

    listView: document.getElementById("list-view"),
    shoppingView: document.getElementById("shopping-view"),
    shoppingGroups: document.getElementById("shopping-groups"),
    backBtn: document.getElementById("back-btn"),
    finishShopping: document.getElementById("finish-shopping"),
    progressCount: document.getElementById("progress-count"),
    progressFill: document.getElementById("progress-fill"),
  };

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
    el.itemCategory.innerHTML = categories
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");
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
      <button type="button" class="recent-chip" data-recent-index="${i}">${escapeHtml(r.name)}</button>
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
  function renderListView() {
    el.emptyState.hidden = items.length !== 0;
    el.startShopping.disabled = items.length === 0;

    const groups = groupByCategory(items);
    el.groups.innerHTML = groups.map(([category, list]) => `
      <div class="category-group">
        <p class="category-title">${escapeHtml(category)}</p>
        ${list.map((item) => `
          <div class="item-row" data-id="${item.id}">
            <div class="item-main">
              <div class="item-name">${escapeHtml(item.name)}</div>
              ${(item.quantity || item.added_by) ? `
                <div class="item-meta">
                  ${item.quantity ? escapeHtml(item.quantity) : ""}
                  ${item.quantity && item.added_by ? " · " : ""}
                  ${item.added_by ? personTag(item) : ""}
                </div>` : ""}
            </div>
            <button class="item-remove" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.name)}">&times;</button>
          </div>
        `).join("")}
      </div>
    `).join("");
  }

  el.groups.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const id = btn.getAttribute("data-remove");
    items = items.filter((i) => String(i.id) !== String(id)); // optimistic
    renderListView();
    try {
      await api(`/api/items/${id}`, { method: "DELETE" });
      loadRecents();
    } catch (err) {
      showStatus(err.message);
      loadItems();
    }
  });

  // ---------- Rendering: shopping view ----------
  function renderShoppingView() {
    const groups = groupByCategory(items);
    const total = items.length;
    const checkedCount = items.filter((i) => i.checked).length;

    el.progressCount.textContent = `${checkedCount} / ${total}`;
    el.progressFill.style.width = total ? `${(checkedCount / total) * 100}%` : "0%";
    document.getElementById("progress-bar").setAttribute("aria-valuenow", total ? Math.round((checkedCount / total) * 100) : 0);

    el.shoppingGroups.innerHTML = groups.map(([category, list]) => `
      <div class="category-group">
        <p class="category-title">${escapeHtml(category)}</p>
        ${list.map((item) => `
          <button type="button" class="shop-item ${item.checked ? "is-checked" : ""}" data-toggle="${item.id}">
            <span class="shop-checkbox">${item.checked ? "&#10003;" : ""}</span>
            <span class="shop-item-main">
              <span class="shop-item-name">${escapeHtml(item.name)}</span>
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
    if (view === "list") renderListView();
    else renderShoppingView();
  }

  el.startShopping.addEventListener("click", () => {
    view = "shopping";
    el.listView.hidden = true;
    el.shoppingView.hidden = false;
    window.scrollTo(0, 0);
    render();
  });

  el.backBtn.addEventListener("click", () => {
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
      await loadItems();
      await loadRecents();
      view = "list";
      el.shoppingView.hidden = true;
      el.listView.hidden = false;
    } catch (err) {
      showStatus(err.message);
    }
  });

  // ---------- Add item ----------
  el.addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = el.itemName.value.trim();
    if (!name) return;
    const payload = {
      name,
      category: el.itemCategory.value,
      quantity: el.itemQty.value.trim(),
      added_by: el.yourName.value.trim(),
      added_by_color: getYourColor(),
    };
    el.itemName.value = "";
    el.itemQty.value = "";
    el.itemName.focus();
    try {
      const created = await api("/api/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      items.push(created);
      renderListView();
      loadRecents();
    } catch (err) {
      showStatus(err.message);
    }
  });

  // ---------- Boot ----------
  (async function init() {
    await loadCategories();
    await loadColors();
    await loadItems();
    await loadRecents();
    startPolling();
  })();
})();
