import path from 'node:path'
import { defineConfig } from 'vite'
import rollupExternalGlobals from 'rollup-plugin-external-globals'
import rollupPolyfillNode from 'rollup-plugin-polyfill-node'
import pkg from './package.json'

const resolve = (_path) => {
  return path.resolve(__dirname, _path)
  // return fileURLToPath(new URL(path, import.meta.url))
}

function getDependencies() {
  const dependencies = Object.keys(pkg.dependencies)
  const devDependencies = Object.keys(pkg.devDependencies)

  return [...dependencies, ...devDependencies]
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
        external: [/^node[:].*/i, 'child_process', ...getDependencies()]
      }
    }
  }
})
