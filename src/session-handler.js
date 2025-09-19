/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary The setup and configuration of the koa app session handler.
 * @file src/session-handler.js
 */

// import fs from 'node:fs/promises'
import fs from 'node:fs'
import session from 'koa-session'
// import redisStore from 'koa-redis'
import { redisStore } from '@mattduffy/koa-redis'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/..`)
const showDebug = process.env.NODE_ENV !== 'production'
const redisEnv = {}
dotenv.config({
  path: path.resolve(root, 'config/sessions.env'),
  processEnv: redisEnv,
  debug: showDebug,
})

// console.log('redis_user: ', redisEnv.REDIS_USER)
// console.log('redis_pwd: ', redisEnv.REDIS_PASSWORD)
// console.log('redis prefix: ', redisEnv.REDIS_KEY_PREFIX)
// console.log('cacert: %o', process.env.REDIS_CACERT)

const sentinelPort = redisEnv.REDIS_SENTINEL_PORT || 26379
const redisConnOpts = {
  isRedisReplset: true,
  keyPrefix: `${redisEnv.REDIS_KEY_PREFIX}:sessions:` ?? 'koa:sessions:',
  dataType: 'ReJSON',
  sentinelRootNodes: [
    { host: redisEnv.REDIS_SENTINEL_01, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_02, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_03, port: sentinelPort },
  ],
  name: 'myprimary',
  database: redisEnv.REDIS_DB,
  sentinelClientOptions: {
    username: redisEnv.REDIS_SENTINEL_USER,
    password: redisEnv.REDIS_SENTINEL_PASSWORD,
    socket: {
      tls: true,
      rejectUnauthorized: false,
      ca: await fs.readFileSync(redisEnv.REDIS_CACERT),
    },
  },
  nodeClientOptions: {       
    username: redisEnv.REDIS_USER,
    password: redisEnv.REDIS_PASSWORD,
    socket: {
      tls: true,
      rejectUnauthorized: false,
      ca: await fs.readFileSync(redisEnv.REDIS_CACERT),
    },
  },
  sentinelRetryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  role: 'master',
}
const redis = await redisStore.init(redisConnOpts)
console.log(
  'did redisStore init work?', await redis.ping()
)

const config = {
  store: redis,
  key: redisEnv.SESSION_KEY ?? 'session',
  maxAge: redisEnv.SESSION_1_DAY * 1000 * 3 ?? (86400 * 1000 * 3),
  rolling: (redisEnv.SESSION_ROLLING.toLowerCase() === 'true') ?? true,
  renew: (redisEnv.SESSION_RENEW.toLowerCase() === 'true') ?? true,
  overwrite: true,
  autoCommit: true,
  secure: (redisEnv.SESSION_SECURE.toLowerCase() === 'true') ?? true,
  httpOnly: (redisEnv.SESSION_HTTPONLY.toLowerCase() === 'true') ?? true,
  signed: (redisEnv.SESSION_SIGNED.toLowerCase() === 'true') ?? true,
  // sameSite: null,
}
// console.log('koa-session config opts', config)
export {
  session,
  config,
  redis,
}
