/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // konva tries to load the optional node "canvas" package; the editor only runs in the browser
  turbopack: { resolveAlias: { canvas: { browser: './src/lib/empty.ts' } } },
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};
export default nextConfig;
