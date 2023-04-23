import { defineConfig } from 'vite'

import path from 'node:path'

const resolve = (_path) => {
  return path.resolve(__dirname, _path)
  // return fileURLToPath(new URL(path, import.meta.url))
}

export default defineConfig((env) => {
  return {
    publicDir: env.command === 'serve' ? './demo/public' : '',
    server: {},
    // plugins: [Terser],
    resolve: {
      alias: [
        {
          find: '@', // 别名
          replacement: resolve('src') // 别名对应地址
        }
      ]
    },
    build: {
      lib: {
        entry: './src/main.js',
        name: 'AutoDeploy',
        fileName: 'index',
        // formats: ['cjs']
      },
    }
  }
})

