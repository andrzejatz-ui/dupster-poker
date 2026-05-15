/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@neon-poker/shared'],
  experimental: {
    typedRoutes: false,
  },
};

module.exports = nextConfig;
