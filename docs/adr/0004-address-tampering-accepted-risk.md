# Address tampering is an accepted v1 risk

An attacker who takes over the server can replace the addresses or extended public keys shown to Donors and redirect new Donations to themselves; keeping private keys off the server (ADR-0001) does not prevent this. For v1 the defence is operational, not in code: the config is mounted read-only into the container and the server is reachable only by SSH key.
