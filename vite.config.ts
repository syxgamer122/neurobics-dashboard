import { defineConfig } from 'vite'
import path from 'path'
import fs from 'fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'


function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

// Dong dau phien ban that vao public/sw.js sau khi build.
//
// public/ duoc Vite chep NGUYEN XI sang dist/, khong qua xu ly, nen khong the
// dung bien moi truong trong do. Vi vay ta sua truc tiep dist/sw.js o buoc
// closeBundle.
//
// Chuoi thay vao gom ca so phien ban LAN dau thoi gian build, de hai lan
// deploy lien tiep ma quen bump package.json thi cache van duoc don.
function swVersionStamp() {
  return {
    name: 'sw-version-stamp',
    apply: 'build' as const,
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js')
      if (!fs.existsSync(swPath)) {
        console.warn('[sw-version-stamp] khong thay dist/sw.js - bo qua')
        return
      }

      const src = fs.readFileSync(swPath, 'utf8')
      if (!src.includes('__APP_VERSION__')) {
        console.warn(
          '[sw-version-stamp] CANH BAO: public/sw.js khong con __APP_VERSION__. ' +
            'Cache cu se KHONG duoc don sau khi deploy.',
        )
        return
      }

      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'),
      )
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      const buildId = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`
      const stamp = `${pkg.version}-${buildId}`

      fs.writeFileSync(swPath, src.split('__APP_VERSION__').join(stamp))
      console.log(`[sw-version-stamp] sw.js VERSION -> neurobics-${stamp}`)
    },
  }
}

export default defineConfig({
  plugins: [
    figmaAssetResolver(),
    swVersionStamp(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
})
