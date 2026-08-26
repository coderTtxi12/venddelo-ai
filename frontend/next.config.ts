import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'bluetooth=(self), usb=(self), serial=(self)',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
