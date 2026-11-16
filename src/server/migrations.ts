export const migrations: readonly string[] = [
  `
  CREATE TABLE donations (
    id TEXT PRIMARY KEY,
    token_id TEXT NOT NULL,
    amount TEXT NOT NULL,
    address TEXT NOT NULL,
    message TEXT NOT NULL,
    nickname TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE held_amounts (
    token_id TEXT NOT NULL,
    amount TEXT NOT NULL,
    donation_id TEXT NOT NULL UNIQUE REFERENCES donations (id),
    held_until INTEGER NOT NULL,
    PRIMARY KEY (token_id, amount)
  ) STRICT;
  `,
];
