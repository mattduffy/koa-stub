import {
  after,
  before,
  describe,
  it,
} from 'node:test'
import assert from 'node:assert/strict'
// import { ioredis } from '../src/daos/impl/redis/ioredis-client.js'
import { redis } from '../src/daos/impl/redis/redis-client.js'
const skip = { skip: true }

describe('Testing how to connect to a redis sentinel cluster with TLS and ACL users.',
  async () => { 
  before(async () => {
    console.log('about to test the new redis sentinel client connection.')
  })

  it('should be a valid ioredis connection', skip, async () => {
    console.log(ioredis)
  })

  it('should be a valid redis connection.', async () => {
    console.log(redis)
  })
})
