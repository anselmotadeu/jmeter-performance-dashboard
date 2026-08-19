import type { NextConfig } from 'next';
const isDev=process.env.NODE_ENV!=='production';
const securityHeaders=[
  {key:'X-Frame-Options',value:'DENY'},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
  {key:'Permissions-Policy',value:'camera=(), microphone=(), geolocation=()'},
  {key:'Content-Security-Policy',value:["default-src 'self'",isDev?"script-src 'self' 'unsafe-inline' 'unsafe-eval'":"script-src 'self' 'unsafe-inline'","style-src 'self' 'unsafe-inline'","img-src 'self' data: blob:","font-src 'self' data:",isDev?"connect-src 'self' https://vitals.vercel-insights.com ws:":"connect-src 'self' https://vitals.vercel-insights.com","worker-src 'self' blob:","object-src 'none'","base-uri 'self'","frame-ancestors 'none'"].join('; ')},
];
const nextConfig:NextConfig={async headers(){return[{source:'/:path*',headers:securityHeaders}]}};
export default nextConfig;
