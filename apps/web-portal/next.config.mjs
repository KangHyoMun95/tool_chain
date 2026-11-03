import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@toolhackchain/shared'],
  // Self-contained server for the Docker image; tracing root is the monorepo root so workspace deps are included.
  output: 'standalone',
  experimental: { outputFileTracingRoot: repoRoot },
};

export default nextConfig;
