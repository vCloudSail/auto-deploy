import path from 'node:path'
import { defineConfig } from 'vite'
import rollupExternalGlobals from 'rollup-plugin-external-globals'
import rollupPolyfillNode from 'rollup-plugin-polyfill-node'

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
        fileName: 'index'
        // formats: ['cjs']
      },
      rollupOptions: {
        external: [
          /^node[:].*/i,
          'child_process',
          'archiver', // 包含需要 polyfill 的全局变量/模块
          'chalk',
          'commander',
          'cosmiconfig',
          'inquirer',
          'ora',
          'ssh2',
          "crypto-js",
          "dayjs"
        ]
      }
    }
  }
})
