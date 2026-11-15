# Chain data comes from hosted providers

Chain data is read from hosted RPC and indexer providers, preferring free tiers, behind one adapter per chain family, instead of running our own nodes. We accept that a compromised or faulty provider could report a Payment that never happened and trigger a false Alert; it cannot move funds, because the service holds no keys (ADR-0001). Cross-checking a second provider is deferred.
