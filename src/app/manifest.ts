import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "健康副駕",
    short_name: "健康副駕",
    description: "個人長期健康追蹤與改善輔助工具",
    lang: "zh-Hant-TW",
    start_url: "/",
    display: "standalone",
    background_color: "#121211",
    theme_color: "#2f7d5b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
