import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_HAS_GOOGLE: process.env.AUTH_GOOGLE_ID ? 'true' : '',
    NEXT_PUBLIC_HAS_WECHAT: process.env.AUTH_WECHAT_APP_ID ? 'true' : '',
  },
};

export default nextConfig;
