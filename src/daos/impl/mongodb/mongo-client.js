/**
 * @module @mattduffy/koa-stub
 * @author Matthew Duffy <mattduffy@gmail.com>
 * @file src/daos/imple/mongodb/mongo-client.js The low-level connection object of mongodb.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MongoClient, ObjectId } from 'mongodb'
import * as Dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(`${__dirname}/../../../..`)
const showDebug = process.env.NODE_ENV !== 'production'
const mongodbEnvPath = path.resolve(root, 'config/mongodb.env')
const mongoEnv = {}
Dotenv.config({ path: mongodbEnvPath, processEnv: mongoEnv, debug: showDebug })

const clientDn = mongoEnv.MONGODB_CLIENT_DN
const dbHost = mongoEnv.MONGODB_HOST
const dbHost2 = mongoEnv.MONGODB_HOST_2
const dbHost3 = mongoEnv.MONGODB_HOST_3
const dbHost4 = mongoEnv.MONGODB_HOST_4
const dbPort1 = mongoEnv.MONGODB_PORT_1
const dbPort2 = mongoEnv.MONGODB_PORT_2
const dbPort3 = mongoEnv.MONGODB_PORT_3
const dbName = mongoEnv.MONGODB_DBNAME
const appName = mongoEnv.MONGODB_APPNAME
const authMechanism = 'MONGODB-X509'
const authSource = '$external'
const clientPEMFile = path.resolve(root, mongoEnv.MONGODB_CLIENT_KEY)
const dbCAKeyFile = path.resolve(root, mongoEnv.MONGODB_CAKEYFILE)
// const clientPEMFile = encodeURIComponent(mongoEnv.MONGODB_CLIENT_KEY)
// const dbCAKeyFile = encodeURIComponent(mongoEnv.MONGODB_CAKEYFILE)
const uri = `mongodb://${clientDn}@${dbHost}:${dbPort1},${dbHost}:${dbPort2},${dbHost}:${dbPort3},${dbHost2}:${dbPort1},${dbHost3}:${dbPort1},${dbHost4}:${dbPort1}/${dbName}?replicaSet=myReplicaSet&authMechanism=${authMechanism}&tls=true&tlsCertificateKeyFile=${clientPEMFile}&tlsCAFile=${dbCAKeyFile}&authSource=${authSource}&appName=${appName}`

// console.log('mongo-client.js >> root = ', root)
// console.log(`mongo-client env path: ${mongodbEnvPath}`)
// console.log(`MongoDB host: ${dbHost}`)
// console.log(`MongoDB TLS client key: ${clientPEMFile}`)
// console.log(`MongoDB TLS server key: ${dbCAKeyFile}`)
// console.log(`MongoDB TLS Subject: ${clientDn}`)

const client = new MongoClient(uri)

export {
  uri,
  dbName,
  client,
  mongoEnv,
  ObjectId,
}
