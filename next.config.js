const withPWA = require('next-pwa')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // next-pwa v2.x reads its options from `pwa` on the Next config object.
  // The custom worker entry is hardcoded to `<project>/worker/index.js` and
  // is prepended to the generated `public/sw.js` — that's the file the
  // browser registers via `navigator.serviceWorker.register('/sw.js')`.
  pwa: {
    dest: 'public',
    register: true,
    skipWaiting: true,
    // Disable in dev so the SW doesn't cache HMR assets and make hot-reload
    // unreliable. The Proactive Coach push flow still works in production
    // builds (`npm run build && npm start`).
    disable: process.env.NODE_ENV === 'development',
    // Documented intent for a future upgrade to next-pwa v5.x — in v2.6.3
    // the directory name is hardcoded to `worker`, so this key is a no-op
    // here but keeps the config self-documenting.
    customWorkerDir: 'worker',
  },
}

module.exports = withPWA(nextConfig)
