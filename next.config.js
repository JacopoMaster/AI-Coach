const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  customWorkerDir: "worker",
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // next-pwa injects a webpack config to build the Service Worker.
  // Next 16 defaults to Turbopack which ignores webpack configs, so the
  // build must be run with `next build --webpack` (see package.json scripts).
};

module.exports = withPWA(nextConfig);
