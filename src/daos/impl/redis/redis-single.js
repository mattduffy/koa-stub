/**
 * @module @mattduffy/koa-glp
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The low-level connection object of redis - single client, not sentinel.
 * @file src/daos/imple/redis/redis-single.js
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from 'redis'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
console.log('redis-client.js >>root = ', root)
const showDebug = process.env.NODE_ENV !== 'production'
const redisEnv = {}
Dotenv.config({
  path: path.resolve(root, 'config/redis.env'),
  processEnv: redisEnv,
  debug: showDebug,
})

if (process.env.R_PRIV_USER && process.env.R_PRIV_PASSWORD) {
  redisEnv.REDIS_USER = process.env.R_PRIV_USER
  redisEnv.REDIS_PASSWORD = process.env.R_PRIV_PASSWORD
  // console.log('updated redisEnv with privileged powers', redisEnv)
}
const redisConnOpts = {
  name: 'redis_single',
  url: `rediss://${redisEnv.REDIS_USER}:${redisEnv.REDIS_PASSWORD}`
    + `@${redisEnv.REDIS_HOST}:${redisEnv.REDIS_HOST_PORT}`
    + `/${redisEnv.REDIS_DB}`,
  database: redisEnv.REDIS_DB,
  username: redisEnv.REDIS_USER,
  password: redisEnv.REDIS_PASSWORD,
  socket: {       
    host: redisEnv.REDIS_HOST,
    port: redisEnv.REDIS_HOST_PORT,
    tls: true,
    rejectUnauthorized: false,
    ca: await fs.readFile(redisEnv.REDIS_CACERT),
  },
  keyPrefix: `${redisEnv.REDIS_KEY_PREFIX}:` ?? 'koa:',
}
// console.log('redis_single connection options', redisConnOpts)
let client 
try {
  client = await createClient(redisConnOpts)
    .on('reconnecting', () => {
      console.log('Redis Client reconnecting')
    })
    .on('error', (err) => { console.error('Redis Client Error', err) })
    .on('ready', () => { console.log('Redis Client connection is ready') })

  await client.connect()
  console.log('client isOpen?', client.isOpen)
  console.log('client isReady?', client.isReady)
} catch (e) {
  console.log(e)
}
export {
  client as redis_single,
}
