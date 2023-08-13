/* Copyright 2016 Jaden M.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
'use strict';

const path = require('path')

const config = {
    mongodb: {
        user: 'admin',
        pass: 'ilVtRiyzVQvGfS4s',
        database: 'coinxcluster.zmxyi.mongodb.net/coinxDB'
    },

    bitcoin: {
        xpub: 'zpub6n8ubMwCZcpJxg9S2ESPDQin5XmVSShrxfhw9fohW5wVdGpwhrKvaRJURFTzKtftKEztx7SsgFqLCWfzyxgGxiKVp3qF5ME3Wcgsx86Xtq3'
    },

    express: {
        secret: 'coinXSecret',
        static: './public',
        templates: path.join(__dirname, 'views'),
        port: 3000
    },

    redis: {
        endpoint:
            '//redis-10338.c98.us-east-1-4.ec2.cloud.redislabs.com:10338',
        pass: 'q1cgRsjjeMgl4Mc1DdBDZDtW6GSlzLGd'
    }
}

const DatabaseConnection = require('./lib/db/databaseConnection')
const db = new DatabaseConnection(config.mongodb)
db.init()

const RedisConnection = require('./lib/db/redisConnection')
const redis = new RedisConnection(config.redis)

const BitcoinGateway = require('./lib/api/bitcoinReceivePayments')
const gateway = new BitcoinGateway({ xpub: config.bitcoin.xpub, redis: redis })

db.instance.once('open', async () => {
    const WebServer = require('./lib/net/webServer')
    const WebServerRouter = require('./lib/net/route/webServerRouter')

    const SocketServer = require('./lib/net/socketServer')

    const webServer = new WebServer(config.express)
    webServer.init(redis)

    const sockServer = new SocketServer()
    sockServer.join(webServer)

    await WebServerRouter.register(
        redis,
        db.instance,
        webServer,
        sockServer,
        gateway
    )

    webServer.listen()
})