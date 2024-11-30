/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/daos/imple/redis/redis-client.js The low-level connection object of redis.
 */

import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { Redis } from 'ioredis'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
console.log('redis-client.js >>root = ', root)
const showDebug = process.env.NODE_ENV !== 'production'
const redisEnv = {}
Dotenv.config({ path: path.resolve(root, 'config/redis.env'), processEnv: redisEnv, debug: showDebug })

const sentinelPort = redisEnv.REDIS_SENTINEL_PORT ?? 26379
const redisConnOpts = {
  sentinels: [
    { host: redisEnv.REDIS_SENTINEL_01, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_02, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_03, port: sentinelPort },
  ],
  name: 'myprimary',
  db: redisEnv.REDIS_DB,
  keyPrefix: `${redisEnv.REDIS_KEY_PREFIX}:` ?? 'koa:',
  sentinelUsername: redisEnv.REDIS_SENTINEL_USER,
  sentinelPassword: redisEnv.REDIS_SENTINEL_PASSWORD,
  username: redisEnv.REDIS_USER,
  password: redisEnv.REDIS_PASSWORD,
  connectionName: 'ioredis',
  enableTLSForSentinelMode: true,
  sentinelRetryStrategy: 100,
  tls: {
    ca: await fs.readFile(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  sentinelTLS: {
    ca: await fs.readFile(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  showFriendlyErrorStack: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
  /* eslint-disable consistent-return */
  reconnectOnError(err) {
    const targetError = 'closed'
    if (err.message.includes(targetError)) {
      return true
    }
    // return false
  },
}
console.log(redisConnOpts)
const redis = new Redis(redisConnOpts)
export {
  redis,
}
