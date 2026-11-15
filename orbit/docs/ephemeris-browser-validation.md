# Mode B browser verification

Verified in Chrome at `http://127.0.0.1:5174/` on 2026-11-15, using the Vite development server and the real browser Web Worker.

- Selected NRHO → Mode B with the Connecting Ridge default and landing UTC `2026-11-16T00:00:00Z`. The full numerical mission returned `VALIDATED`, with **15 / 15 checks passed**.
- The computed NRHO/transfer and lunar descent paths rendered in WebGL. The NRHO mode selector, dated reference metadata, result labels and timeline identified Mode B.
- Selected the touchdown event. The display reached `2026-11-16 00:00:00 UTC`, surface-relative speed **0.5 m/s**, and approximately zero DEM clearance. The UTC display rounds to whole seconds; exported numerical times retain their own precision.
- Changed the target to November 30 with the browser's date control. The engine rejected unsupported reference departure dates. An accessible alert dialog explained the reference coverage limit and recommended changing landing UTC or transfer duration. No successful flight path was shown.
- Returned to the default validated result. No browser error log entries were reported by the verification tab.

Screenshots:

- [Computed NRHO and transfer](screenshot-mode-b.jpg)
- [Validated touchdown in lunar view](screenshot-mode-b-touchdown.jpg)
- [Unsupported-date warning and recommendations](screenshot-mode-b-failure.jpg)

The final TypeScript/Vite production build passed. `npm test` passed all 47 checks, including existing Mode A and LLO regression tests. Only timeline labels/whole-second UTC formatting and documentation changed after that test run; the final UI build and browser checks above cover those presentation changes.

Numerical limits, independent SPICE/DOP853 replay and scenario results are documented in [VALIDATION.md](../VALIDATION.md). These are numerical model checks, not certification of an operational mission. This verification did not publish a new hosted version or push the Mode B changes to GitHub.
