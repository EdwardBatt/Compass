-- Larder schema (SQLite). Quantities are in base units: g, ml or count.
CREATE TABLE recipe (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  serves INTEGER NOT NULL DEFAULT 2
);

CREATE TABLE ingredient (
  id INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipe(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'count'))
);

CREATE TABLE list_item (
  id INTEGER PRIMARY KEY,
  list_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('g', 'ml', 'count')),
  ticked INTEGER NOT NULL DEFAULT 0
);
