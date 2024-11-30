/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/session-handler.js The setup and configuration of the koa app session handler.
 */

// import fs from 'node:fs/promises'
import fs from 'node:fs'
import session from 'koa-session'
import redisStore from 'koa-redis'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/..`)
const showDebug = process.env.NODE_ENV !== 'production'
const redisEnv = {}
dotenv.config({ path: path.resolve(root, 'config/sessions.env'), processEnv: redisEnv, debug: showDebug })

// console.log('redis_user: ', redisEnv.REDIS_USER)
// console.log('redis_pwd: ', redisEnv.REDIS_PASSWORD)
// console.log('redis prefix: ', redisEnv.REDIS_KEY_PREFIX)
// console.log('cacert: %o', process.env.REDIS_CACERT)

const sentinelPort = redisEnv.REDIS_SENTINEL_PORT || 26379
const redisConnOpts = {
  sentinels: [
    { host: redisEnv.REDIS_SENTINEL_01, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_02, port: sentinelPort },
    { host: redisEnv.REDIS_SENTINEL_03, port: sentinelPort },
  ],
  name: 'myprimary',
  db: redisEnv.REDIS_DB,
  keyPrefix: `${redisEnv.REDIS_KEY_PREFIX}:sessions:` ?? 'koa:sessions:',
  sentinelUsername: redisEnv.REDIS_SENTINEL_USER,
  sentinelPassword: redisEnv.REDIS_SENTINEL_PASSWORD,
  username: redisEnv.REDIS_USER,
  password: redisEnv.REDIS_PASSWORD,
  connectionName: `${redisEnv.REDIS_CONNECTION_NAME}-sessions`,
  enableTLSForSentinelMode: true,
  showFriendlyErrorStack: true,
  keepAlive: 10000,
  tls: {
    ca: fs.readFileSync(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  sentinelTLS: {
    ca: fs.readFileSync(redisEnv.REDIS_CACERT),
    rejectUnauthorized: false,
    requestCert: true,
  },
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
  // sentinelRetryStrategy: 100,
  sentinelRetryStrategy(times) {
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
const redis = redisStore(redisConnOpts)

const config = {
  store: redis,
  key: redisEnv.SESSION_KEY ?? 'session',
  maxAge: redisEnv.SESSION_1_DAY * 2 ?? (86400000 * 2),
  rolling: (redisEnv.SESSION_ROLLING.toLowerCase() === 'true') ?? true,
  renew: (redisEnv.SESSION_RENEW.toLowerCase() === 'true') ?? true,
  overwrite: true,
  autoCommit: true,
  secure: (redisEnv.SESSION_SECURE.toLowerCase() === 'true') ?? true,
  httpOnly: (redisEnv.SESSION_HTTPONLY.toLowerCase() === 'true') ?? true,
  signed: (redisEnv.SESSION_SIGNED.toLowerCase() === 'true') ?? true,
  sameSite: null,
}

export { session, config, redis }
