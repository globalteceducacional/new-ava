import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@ava/shared'],
  output: 'standalone',
};

export default nextConfig;
