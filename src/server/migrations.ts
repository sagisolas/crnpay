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
    expires_at INTEGER NOT NULL,
    confirmed_at INTEGER
  ) STRICT;

  CREATE TABLE held_amounts (
    token_id TEXT NOT NULL,
    amount TEXT NOT NULL,
    donation_id TEXT NOT NULL UNIQUE REFERENCES donations (id),
    held_until INTEGER NOT NULL,
    PRIMARY KEY (token_id, amount)
  ) STRICT;

  CREATE TABLE transfers (
    network TEXT NOT NULL,
    tx_id TEXT NOT NULL,
    output_index INTEGER NOT NULL,
    token_id TEXT NOT NULL,
    address TEXT NOT NULL,
    amount TEXT NOT NULL,
    confirmations INTEGER NOT NULL,
    seen_at INTEGER NOT NULL,
    donation_id TEXT UNIQUE REFERENCES donations (id),
    PRIMARY KEY (network, token_id, tx_id, output_index)
  ) STRICT;

  CREATE TABLE chain_cursors (
    token_id TEXT PRIMARY KEY,
    cursor TEXT NOT NULL
  ) STRICT;
  `,
];
