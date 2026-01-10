/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The script to bulk delete keys from redis.
 * @file src/utils/deleteData.js
 */
/* eslint-disable import/no-extraneous-dependencies */
import path from 'node:path'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { redis_single as redis } from '../daos/impl/redis/redis-single.js'
import { _log, _error } from './logging.js'
/* eslint-enable import/no-extraneous-dependencies */

const log = _log.extend('utils:load-data')
const error = _error.extend('utils:load-data')
const info = _log.extend('utils:load-data')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
const appEnv = {}
log(`appRoot: ${appRoot}`)
dotenv.config({
  path: path.resolve(appRoot, 'config/app.env'),
  processEnv: appEnv,
})
const redisEnv = {}
dotenv.config({
  path: path.resolve(appRoot, 'config/redis.env'),
  processEnv: redisEnv,
})
const DB_PREFIX = redisEnv.REDIS_KEY_PREFIX

const program = new Command()
program.name('deleteData')
  .requiredOption('--key-prefix <prefix>', 'The app-specific key prefix for Redis to use.')
  .requiredOption('--key-type <type>', 'The redis data type of the keys to delete.')
  .requiredOption('--key-name <name>', 'Key name to append to the app-specific key prefix.')
  .option('--key-count <count>', 'The number of keys to return per cursor.', 20)
  .option('--dry-run', 'Dry run the delete command, don\'t actully delete anything.')

program.parse(process.argv)
const options = program.opts()
options.dbPrefix = DB_PREFIX
log('options:', options)

const keyPath = options?.keyPrefix ?? options.dbPrefix
log(`full keyPath: ${keyPath}:${options.keyName}`)
log(`redis.options.keyPrefix: ${redis.options.keyPrefix}`)
// process.exit()

async function del() {
  const scanArgs = {
    CURSOR: '0',
    MATCH: `${keyPath}:${options.keyName}`,
    TYPE: options.keyType,
    COUNT: options.keyCount,
  }
  log(scanArgs)
  const myIterator = await redis.scanIterator(scanArgs)
  let batch
  let count = 0
  // eslint-disable-next-line
  while (batch = await myIterator.next()) {
    if (batch.done) {
      break
    }
    // eslint-disable-next-line
    for await (const k of batch.value) {
      let deleted
      if (options.keyType === 'ReJSON-RL') {
        if (!options.dryRun) {
          deleted = await redis.json.del(k)
        } else {
          log(`DRY-RUN: redis.json.del(${k})`)
        }
      }
      if (!options.dryRun) {
        deleted = await redis.del(k)
      } else {
        log(`DRY-RUN: redis.del(${k})`)
      }
      console.log('deleted', k, deleted)
      count += 1
    }
  }
  return count
}
try {
  const result = await del()
  log(`key ${keyPath}:${options.keyName} deleted?`, result)
} catch (e) {
  error(e)
  // throw new Error(e.message, { cause: e })
  error(e.message)
  info('Try overriding the default redis user/password with ones that can use DEL.')
  info('R_PRIV_USER=<user> R_PRIV_PASSWORD=<psswd> npm run deleteData ...')
}

// Done deleting the data, exit process.
process.exit()
