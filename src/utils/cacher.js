import fs from 'node:fs'
import path from 'node:path'
import CryptoJS from 'crypto-js'
import logger from './logger.js'
import settings from '@/settings'

// 密钥
const SECRET_KEY = 'auto-deploy'
// 密钥偏移量
// const SECRET_IV = CryptoJS.enc.Utf8.parse('ovOh2xYoRdfATob6')

class JsonCacher {
  /** @type {Map<string,any>} */
  #data
  /** @type {string} */
  path
  /** @type {boolean} */
  encrypt
  name
  /**
   *
   * @param {object} param
   * @param {string} param.name
   * @param {boolean} param.encrypt
   */
  constructor({ name, encrypt } = {}) {
    this.name = name
    this.encrypt = encrypt
    this.path = path.resolve(settings.cachePath, name)

    if (fs.existsSync(settings.cachePath)) {
      const file = fs.readFileSync(this.path, {
        encoding: 'utf8',
        flag: 'r+'
      })

      let storeData = file.toString('utf8')
      if (encrypt) {
        logger.debug('解密')
        storeData = CryptoJS.DES.decrypt(storeData, SECRET_KEY, {
          mode: CryptoJS.mode.ECB,
          padding: CryptoJS.pad.Pkcs7
        }).toString(CryptoJS.enc.Utf8)
      }
      this.#data = new Map(Object.entries(JSON.parse(storeData)))
    } else {
      this.#data = new Map()
    }

    process.once('exit', () => {
      this.save()
    })
  }
  has(key) {
    return this.#data.has(key)
  }
  /**
   *
   * @param {string} key
   * @param {string} value
   */
  set(key, value) {
    this.#data.set(key, value)
  }

  get(key) {
    return this.#data.get(key) || null
  }
  getAll() {
    return Object.fromEntries(this.#data.entries())
  }

  /**
   *
   * @param {*} key
   */
  remove(key) {
    return this.#data.delete(key)
  }

  save() {
    logger.debug(`[JsonCacher] 保存数据到缓存文件`)

    let data = JSON.stringify(this.getAll())
    // console.log(data)

    if (!fs.existsSync(settings.cachePath)) {
      fs.mkdirSync(settings.cachePath)
    }

    if (this.encrypt) {
      data = CryptoJS.DES.encrypt(data, SECRET_KEY, {
        mode: CryptoJS.mode.ECB,
        padding: CryptoJS.pad.Pkcs7
      }).toString()
    }

    fs.writeFileSync(this.path, data, {
      encoding: 'utf8',
      flag: 'w+'
    })
    return true
  }
}

export const PasswordCacher = new JsonCacher({
  name: 'password',
  encrypt: true
})

export default JsonCacher
