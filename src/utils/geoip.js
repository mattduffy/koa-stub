/**
 * @module @mattduffy/exif-inspector
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @summary A simple middleware to expose Maxmind GeoIP databases.
 * @file src/utils/geoip.js
 */

import * as dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Reader } from '@maxmind/geoip2-node'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const appRoot = path.resolve(`${__dirname}/../..`)
// console.log(`geoip appRoot: ${appRoot}`)
const geoEnv = {}
const showDebug = process.env.NODE_ENV !== 'production'
dotenv.config({
  path: path.resolve(appRoot, 'config/geoip.env'),
  processEnv: geoEnv,
  debug: showDebug,
})
// console.log('GeoIP database locations: %o', geoEnv)

let city
try {
  city = await Reader.open(geoEnv.GEOIP_CITY_MMDB)
} catch (e) {
  city = false
}
let country
try {
  country = await Reader.open(geoEnv.GEOIP_COUNTRY_MMDB)
} catch (e) {
  country = false
}
let asn
try {
  asn = await Reader.open(geoEnv.GEOIP_ASN_MMDB)
} catch (e) {
  asn = false
}

export const geoIPCity = city
export const geoIPCountry = country
export const geoIPASN = asn
