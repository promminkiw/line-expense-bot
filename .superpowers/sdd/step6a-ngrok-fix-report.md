
# ngrok skip-warning header fix
- RED: `npx vitest run public/liff/api.test.mjs` -> 1 failed | 6 passed (header undefined)
- GREEN: `npx vitest run public/liff` -> 17 passed; `npm test` -> 257 passed
- Header shared via NGROK_SKIP_WARNING_HEADERS exported from api.mjs, used in request() and boot() /api/config fetch.
