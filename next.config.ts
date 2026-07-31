import type { NextConfig } from "next";

// 通常の SSR ビルド（Vercel）。他のPFシリーズと同一パターン。
const nextConfig: NextConfig = {
  // 共通UIパッケージは TSX をそのまま配布しているためトランスパイルする
  transpilePackages: ["@paloma-pf/ui"],
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
