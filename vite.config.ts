import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

// Dong dau phien ban that vao public/sw.js sau khi build.
//
// public/ duoc Vite chep NGUYEN XI sang dist/, khong qua xu ly, nen khong the
// dung bien moi truong trong do. Vi vay ta sua truc tiep dist/sw.js o buoc
// closeBundle.
//
// TRUOC DAY plugin nay chi console.warn roi `return` khi khong thay dist/sw.js
// hoac khong con chuoi __APP_VERSION__. Hau qua: build VAN THANH CONG, deploy
// VAN chay, nhung service worker giu nguyen ten cache cu -> cache khong bao gio
// duoc don -> nguoi dung ket o bundle JS cu va bao "sua roi ma van loi". Mot
// dong canh bao thi troi qua giua hang tram dong log CI, khong ai thay.
//
// GIO plugin NEM LOI, build do ngay. Mot lan build do o may minh re hon nhieu
// so voi mot ban deploy im lang khong don cache.
function swVersionStamp() {
  return {
    name: "sw-version-stamp",
    apply: "build" as const,
    closeBundle() {
      const distDir = path.resolve(__dirname, "dist");
      const swPath = path.join(distDir, "sw.js");

      if (!fs.existsSync(swPath)) {
        throw new Error(
          "[sw-version-stamp] khong thay dist/sw.js. public/sw.js con ton tai khong?",
        );
      }

      const src = fs.readFileSync(swPath, "utf8");
      if (!src.includes("__APP_VERSION__")) {
        throw new Error(
          "[sw-version-stamp] public/sw.js khong con chuoi __APP_VERSION__. " +
            "Thieu no thi cache cu se KHONG duoc don sau khi deploy.",
        );
      }

      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, "package.json"), "utf8"),
      );

      // Van tay noi dung thay cho dau thoi gian.
      //
      // TRUOC DAY stamp la `<version>-<yyyymmddHHmm>`. Hai van de: (1) quen bump
      // package.json thi chi con dau phut de phan biet, (2) CI chay lai hai lan
      // trong cung mot phut ra dung mot VERSION -> cache cu khong bi don.
      //
      // Ten file trong dist/assets da chua hash noi dung, nen bam danh sach ten
      // file la du: NOI DUNG doi -> ten doi -> van tay doi -> VERSION doi.
      const assetsDir = path.join(distDir, "assets");
      const assetNames = fs.existsSync(assetsDir)
        ? fs.readdirSync(assetsDir).sort()
        : [];

      if (assetNames.length === 0) {
        throw new Error(
          "[sw-version-stamp] dist/assets rong. Build that bai, hay assetsDir bi doi?",
        );
      }

      const fingerprint = crypto
        .createHash("sha256")
        .update(assetNames.join("\n"))
        .digest("hex")
        .slice(0, 12);

      const stamp = `${pkg.version}-${fingerprint}`;
      fs.writeFileSync(swPath, src.split("__APP_VERSION__").join(stamp));
      console.log(
        `[sw-version-stamp] sw.js VERSION -> mindgem-${stamp} (${assetNames.length} asset)`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    // GHI CHU: figmaAssetResolver() da bi xoa. No giai quyet cac import dang
    // `figma:asset/...` do Figma Make sinh ra, tro vao thu muc src/assets.
    // Repo nay khong con mot import `figma:asset` nao va thu muc src/assets
    // cung khong ton tai -> plugin chay khong, chi lam nguoi doc hieu sai la
    // du an van phu thuoc Figma.
    swVersionStamp(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});
