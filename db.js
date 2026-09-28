const { createClient } = require("@libsql/client");

// Falls back to a local SQLite file when no Turso credentials are set,
// so you can run and test this app on your own machine before deploying.
// In production (Render), set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.
const url = process.env.TURSO_DATABASE_URL || "file:local.db";
const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

const client = createClient({ url, authToken });

// The order here is the order items are displayed in, roughly matching
// a typical grocery store layout (produce first, household near the end).
const CATEGORIES = [
  "Produce",
  "Bakery",
  "Dairy & Eggs",
  "Meat & Seafood",
  "Pantry & Dry Goods",
  "Frozen",
  "Beverages",
  "Snacks",
  "Household & Cleaning",
  "Personal Care",
  "Other",
];

// A fixed palette for "who added this" tags. Kept server-side as the
// source of truth so a client can only ever set a color from this list
// (never an arbitrary string that ends up in another family member's HTML).
const PERSON_COLORS = [
  { name: "Blueberry", hex: "#3B5FA0" },
  { name: "Plum", hex: "#7B4B94" },
  { name: "Raspberry", hex: "#C0446B" },
  { name: "Mango", hex: "#E08A2B" },
  { name: "Teal", hex: "#2E8B84" },
  { name: "Mustard", hex: "#B98A1E" },
  { name: "Slate", hex: "#55617A" },
  { name: "Indigo", hex: "#4B4A9E" },
];

async function init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      quantity TEXT,
      added_by TEXT,
      added_by_color TEXT,
      checked INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);

  // Lightweight migration for databases created before added_by_color
  // existed. SQLite/libSQL has no "ADD COLUMN IF NOT EXISTS", so we just
  // try it and ignore the "duplicate column" error on a DB that already
  // has it.
  try {
    await client.execute("ALTER TABLE items ADD COLUMN added_by_color TEXT");
  } catch (err) {
    // Already present — nothing to do.
  }

  // "Teach the categorizer": whenever someone manually picks a category
  // for an item name, we remember it here so it's recognized next time.
  // `term` is the normalized item name (lowercased / Arabic-normalized by
  // the client), so it's a stable key regardless of capitalization.
  await client.execute(`
    CREATE TABLE IF NOT EXISTS learned_terms (
      term TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

module.exports = { client, init, CATEGORIES, PERSON_COLORS };
