import inquirer from 'inquirer'
import ssh from './modules/ssh.js'

async function test() {
  // let res = await inquirer.prompt([
  //   {
  //     type: 'input',
  //     name: 'password',
  //     message: '请输入密码'
  //   }
  // ])
  // console.log(res)
  const client = new ssh({
    host: '192.168.14.211',
    port: '22',
    username: 'root',
    // password: 'Zxcvbn2022@$&*'
  })
  await client.connect()
}

test()
