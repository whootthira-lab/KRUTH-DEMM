-- Disable Row Level Security on category_flags so analytics can query it anonymously
ALTER TABLE category_flags DISABLE ROW LEVEL SECURITY;
