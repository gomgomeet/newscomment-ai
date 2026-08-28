import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/*": ["./assets/fonts/NanumGothic.ttf"],
  },
};

export default nextConfig;
