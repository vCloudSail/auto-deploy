import inquirer from 'inquirer'
import { PasswordCacher } from './utils/cacher.js'
import path from 'node:path'
async function test() {
  // console.log(path.resolve())
  console.log(PasswordCacher.get('asd'))
  PasswordCacher.set('asd', 'asdasdasdasdasd')
}

test()
