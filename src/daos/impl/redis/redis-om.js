/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The low-level connection object of redis-om.
 * @file src/daos/imple/redis/redis-om.js
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createClient } from 'redis'
import {
  Repository,
  EntityId,
  Schema,
  Client,
} from 'redis-om'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
console.log('redis-client.js >>root = ', root)
const showDebug = process.env.NODE_ENV !== 'production'
// Dotenv.config({ path: path.resolve(root, 'config/redis.env'), debug: showDebug })
const redisEnv = {}
Dotenv.config({
  path: path.resolve(root, 'config/redis.env'),
  processEnv: redisEnv,
  debug: showDebug,
})

const config = {
  url: `rediss://${redisEnv.REDIS_HOST}:${redisEnv.REDIS_HOST_PORT}/${redisEnv.REDIS_DB}`,
  database: redisEnv.REDIS_DB,
  username: redisEnv.REDIS_USER,
  password: redisEnv.REDIS_PASSWORD,
  socket: {
    tls: true,
    ca: await fs.readFile(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
}
const redis = createClient(config)
await redis.connect()
const clientOm = await new Client().use(redis)
// console.log(config)
export {
  redis,
  clientOm,
  Client,
  EntityId,
  Schema,
  Repository,
}
