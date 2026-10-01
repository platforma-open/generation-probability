---
"@platforma-open/milaboratories.generation-probability.software": patch
"@platforma-open/milaboratories.generation-probability.block": patch
---

Fix the block on a backend without Docker, such as the built-in backend.

- Run the scorer in the `3.12.10-pgen` Python run environment. The backend installs the Python packages offline from the run environment. The base run environment did not have the pinned `llvmlite`, `numba`, and `numpy` versions.
- Start the worker processes with `spawn`, not `forkserver`. Windows has no `forkserver`. On Linux and macOS, the `forkserver` socket path in a deep work directory was longer than the system limit.
