/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile the workspace shared package from source when needed.
  transpilePackages: ['@toolhackchain/shared'],
};

export default nextConfig;
