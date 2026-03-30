// This file is no longer needed. Delete it from the repo.
// Table setup SQL is in /setup-tables.sql — run it in Supabase SQL Editor.
module.exports = function(req, res) {
  res.status(410).json({ message: 'Use setup-tables.sql in Supabase SQL Editor instead.' });
};
