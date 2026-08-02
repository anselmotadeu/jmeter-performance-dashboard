import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Allow large file uploads through server actions and route handlers.
    // Note: On Vercel Hobby, the platform enforces a 4.5MB body limit
    // regardless of this setting. Upgrade to Vercel Pro for up to 100MB.
    // For files > 100MB, use direct Supabase Storage uploads (Phase 2).
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

export default nextConfig;
