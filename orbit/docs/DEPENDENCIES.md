# Frontend dependencies

React 18.3.1, React Three Fiber 8.17.10, Drei 9.121.4, Three.js 0.170.0, and Recharts 2.15.4 are pinned in `frontend/package.json` and `frontend/package-lock.json` for reproducible installation. The React/Vite framework follows the inspected reference project's framework; the new app adds React Three Fiber and Recharts.

The initial Vite 5.4.11 pin from the reference project was updated to **6.4.6** after `npm audit` and the upstream security advisories were checked. The existing `@vitejs/plugin-react` 4.3.4 declares Vite 6 compatibility. The maintained Vite 6 patch avoids an unnecessary migration of React and the application code.

Official upstream evidence:

- [Vite advisory GHSA-p4f5-76q4-ffq7](https://github.com/vitejs/vite/security/advisories/GHSA-p4f5-76q4-ffq7): Vite 6.4.6 is the patched Vite 6 version.
- [Vite advisory GHSA-8g5g-mxqh-grgj](https://github.com/vitejs/vite/security/advisories/GHSA-8g5g-mxqh-grgj): preceding Vite 6 maintenance fix.
- Official npm metadata for `vite@6.4.6` declares Node `^18.0.0 || ^20.0.0 || >=22.0.0` and esbuild `^0.25.0`.

Installation validation on 2026-11-15: **180 packages audited, 0 reported vulnerabilities**. This is the npm audit result at that time, not a security guarantee. Production output is static assets; the Vite server is a local development/preview tool bound to 127.0.0.1.

No runtime Google Fonts, remote module CDN, Python server, or API proxy is required. NASA files are served as same-origin static assets, and the computational engine runs in a Web Worker.
