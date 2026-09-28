const express = require("express");
const path = require("path");
const { client, init, CATEGORIES, PERSON_COLORS } = require("./db");

const VALID_COLORS = new Set(PERSON_COLORS.map((c) => c.hex));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper: sort rows by the store-layout category order, then oldest first.
function sortByCategory(rows) {
  const order = new Map(CATEGORIES.map((c, i) => [c, i]));
  return rows.slice().sort((a, b) => {
    const ca = order.has(a.category) ? order.get(a.category) : CATEGORIES.length;
    const cb = order.has(b.category) ? order.get(b.category) : CATEGORIES.length;
    if (ca !== cb) return ca - cb;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

app.get("/api/categories", (req, res) => {
  res.json(CATEGORIES);
});

app.get("/api/colors", (req, res) => {
  res.json(PERSON_COLORS);
});

// All items still on the list (not yet finished/archived from a shopping trip).
app.get("/api/items", async (req, res) => {
  try {
    const result = await client.execute(
      "SELECT * FROM items WHERE completed = 0"
    );
    res.json(sortByCategory(result.rows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load items." });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const { name, category, quantity, added_by, added_by_color } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Item name is required." });
    }
    const cat = CATEGORIES.includes(category) ? category : "Other";
    // Only ever store a color from the fixed palette — never an arbitrary
    // string, since this value gets rendered straight into other family
    // members' pages.
    const color = VALID_COLORS.has(added_by_color) ? added_by_color : null;
    const result = await client.execute({
      sql: `INSERT INTO items (name, category, quantity, added_by, added_by_color)
            VALUES (?, ?, ?, ?, ?) RETURNING *`,
      args: [name.trim(), cat, quantity || null, added_by || null, color],
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not add item." });
  }
});

// Toggle "checked" while shopping, or edit name/category/quantity.
app.patch("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const fields = [];
    const args = [];

    if (typeof req.body.checked === "boolean") {
      fields.push("checked = ?");
      args.push(req.body.checked ? 1 : 0);
    }
    if (typeof req.body.name === "string" && req.body.name.trim()) {
      fields.push("name = ?");
      args.push(req.body.name.trim());
    }
    if (typeof req.body.category === "string" && CATEGORIES.includes(req.body.category)) {
      fields.push("category = ?");
      args.push(req.body.category);
    }
    if (typeof req.body.quantity === "string") {
      fields.push("quantity = ?");
      args.push(req.body.quantity);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "Nothing to update." });
    }

    args.push(id);
    const result = await client.execute({
      sql: `UPDATE items SET ${fields.join(", ")} WHERE id = ? RETURNING *`,
      args,
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found." });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not update item." });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    await client.execute({
      sql: "DELETE FROM items WHERE id = ?",
      args: [req.params.id],
    });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not remove item." });
  }
});

// Ends a shopping trip: everything checked off gets archived (completed = 1)
// so it drops off the active list. Unchecked items stay for next time.
app.post("/api/shopping/finish", async (req, res) => {
  try {
    const result = await client.execute(`
      UPDATE items
      SET completed = 1, completed_at = datetime('now')
      WHERE checked = 1 AND completed = 0
      RETURNING id
    `);
    res.json({ archived: result.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not finish shopping trip." });
  }
});

// Suggests items that have been bought before but aren't on the active
// list right now, so re-adding a staple is a single tap instead of retyping
// it. Most-recently-completed first, deduplicated by name.
app.get("/api/recent", async (req, res) => {
  try {
    const [completedResult, activeResult] = await Promise.all([
      client.execute(`
        SELECT name, category, MAX(completed_at) AS last_completed
        FROM items
        WHERE completed = 1
        GROUP BY LOWER(name)
        ORDER BY last_completed DESC
        LIMIT 40
      `),
      client.execute("SELECT name FROM items WHERE completed = 0"),
    ]);

    const activeNames = new Set(
      activeResult.rows.map((r) => String(r.name).toLowerCase())
    );

    const suggestions = completedResult.rows
      .filter((r) => !activeNames.has(String(r.name).toLowerCase()))
      .slice(0, 12);

    res.json(suggestions);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load recent items." });
  }
});

// Everything the household has taught the categorizer so far. The table
// stays tiny (one row per distinct item name), so we just send it all.
app.get("/api/learned", async (req, res) => {
  try {
    const result = await client.execute("SELECT term, category FROM learned_terms");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load learned categories." });
  }
});

// Save (or correct) what category an item name belongs to.
app.post("/api/learn", async (req, res) => {
  try {
    const term = typeof req.body.term === "string" ? req.body.term.trim().slice(0, 120) : "";
    const category = req.body.category;
    if (!term) {
      return res.status(400).json({ error: "A term is required." });
    }
    if (!CATEGORIES.includes(category)) {
      return res.status(400).json({ error: "Unknown category." });
    }
    const result = await client.execute({
      sql: `INSERT INTO learned_terms (term, category, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(term) DO UPDATE SET
              category = excluded.category,
              updated_at = excluded.updated_at
            RETURNING term, category`,
      args: [term, category],
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not save learned category." });
  }
});

init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Grocery list running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });
