/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file The script to create a new user account.
 * @file src/utils/newUser.js
 */

import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
/* eslint-disable-next-line */
import { Command } from 'commander'
/* eslint-disable-next-line */
import * as Users from '@mattduffy/users/Users.js'
import * as mongoClient from '../daos/impl/mongodb/mongo-client.js'
// import * as redis from '../daos/impl/redis/redis-client.js'
// import { App } from '../models/app.js'
// import { Users } from '../models/users.js'
import { _log, _error } from './logging.js'

const log = _log.extend('utils:new-user')
const error = _error.extend('utils:new-user')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({ path: path.resolve(appRoot, 'config/app.env'), processEnv: appEnv, debug: true })

const program = new Command()
program.name('newUser')
  .requiredOption('--first <name>', 'User\'s first name')
  .requiredOption('--last <name>', 'User\'s last name')
  .requiredOption('--email <addr>', 'User\'s email address')
  .requiredOption(
    '--desc <description>',
    'Short description of the account',
    'New account created using cli.',
  )
  .requiredOption('--password <password>', 'The new user\'s initial password.')
  .option('-a, --admin', 'Make this user account admin, otherwise regular.')
  .option('-t, --test', 'A test user account, not a real user.')

program.parse(process.argv)
const options = program.opts()
log(options)

let { email } = options
if (options?.test === true) {
  const rando = crypto.randomBytes(2).toString('hex')
  const at = options.email.indexOf('@')
  email = `${options.email.slice(0, at)}-${rando}${options.email.slice(at)}`
}

const ctx = {
  app: {
    root: appRoot,
    dirs: {
      public: {
        dir: `${appRoot}/public`,
      },
      private: {
        dir: `${appRoot}/private`,
      },
    },
  },
}

const _id = new mongoClient.ObjectId()
log(`new mongo _id: ${_id}`)

const userProps = {
  _id,
  first: options.first ?? 'First',
  last: options.last ?? 'User',
  emails: [{ primary: email ?? 'new_user@genevalakepiers.com', verified: false }],
  description: `A new (${(options?.test) ? 'test' : ''}) `
    + `${(options?.admin) ? 'admin' : 'user'} account created.`,
  username: `${options.first.toLowerCase()}${options.last.toLowerCase()}`,
  password: options.password,
  jwts: { token: '', refresh: '' },
  userStatus: 'active',
  schemaVer: 0,
  ctx,
  env: appEnv,
  dbName: mongoClient.dbName,
  client: mongoClient.client,
}

// log(mongoClient.uri)
// log('[newUser] DB credentials in use: %O', userProps.client.options.credentials)
// log('[newUser] DB name in use: ', userProps.client.options.dbName)

let newUser
if (options.admin === true) {
  newUser = Users.newAdminUser(userProps)
} else {
  newUser = Users.newUser(userProps)
}
try {
  newUser.publicDir = 'a'
  // TODO Fix issue with assigning privateDir looses hashed account directory in path.
  // newUser.privateDir = 'a'
  const newUserKeys = await newUser.generateKeys()
  log(newUserKeys)
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}
let savedNewUser
try {
  savedNewUser = await newUser.save()
  log(savedNewUser.privateDir)
} catch (e) {
  error(e)
  throw new Error(e.message, { cause: e })
}
// Done creating new user account, exit process.
process.exit()
