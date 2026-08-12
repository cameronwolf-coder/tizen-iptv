# 2026-08-11 — Relay pairings must outlive the relay process

**The problem, in one line:** Wolf TV persisted bearer tokens in the TV and phone browsers but kept the server-side token associations only in RAM, so a relay restart made both saved tokens unknowable and forced a new pairing.

## Approach

1. Trace each opaque token from issuance through every authenticated relay route before changing the store.
2. Persist only the durable relationship: hashed TV token to TV/catalog, and hashed phone token to TV.
3. Keep pairing codes, failed-attempt counters, and pending commands ephemeral because they are short-lived or process-local by design.
4. Write a versioned JSON snapshot atomically with owner-only permissions after registration, pairing, and catalog refresh.
5. Prove the contract against two fresh application instances using the same state file: the original phone token still reads the catalog and queues a command, and the original TV token consumes it.

## Judgment calls

- Raw bearer tokens never reach disk. SHA-256 lookup keys are sufficient because the issued tokens have high entropy and do not need to be recovered by the server.
- Corrupt or unknown state fails startup explicitly instead of silently erasing pairings.
- Existing memory-only pairings cannot be reconstructed; users pair once after upgrading, then future relay restarts preserve the relationship.
- No database or dependency was added. The state is tiny, local, and single-process, so an atomic standard-library JSON file is the smaller reliable mechanism.

## Reusable rule

When clients persist opaque credentials, persist the server-side association too—or a normal server restart turns valid-looking credentials into a permanent authentication failure.

## Evidence

- `tests/test_remote_server.py::test_paired_clients_survive_relay_restart_without_persisting_bearer_tokens`
- Live uvicorn smoke: register and pair, restart the process, then fetch catalog, queue play, and consume play with the original credentials.
