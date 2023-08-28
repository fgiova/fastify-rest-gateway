# fastify rest-gateway

[![NPM version](https://img.shields.io/npm/v/@fgiova/fastify-rest-gateway.svg?style=flat)](https://www.npmjs.com/package/@fgiova/fastify-rest-gateway)
![CI workflow](https://github.com/fgiova/fastify-rest-gateway/actions/workflows/node.js.yml/badge.svg)
[![TypeScript](https://img.shields.io/badge/%3C%2F%3E-TypeScript-%230074c1.svg)](http://www.typescriptlang.org/)

## Description
This plugin for fastify 4.x allows you to expose REST APIs for your REST microservices
starting from OpenApi contracts hosted into same microservice.

Routes to be exposed by the gateway must be tagged with the appropriate tags; 
by default "public-api" for public APIs, "private-api" for hidden APIs.

**Note**<br>
To distribute open-api compliant contracts I recommend using the plugins for fastify [@fastify/swagger](https://github.com/fastify/fastify-swagger) and [@fastify/swagger-ui](https://github.com/fastify/fastify-swagger-ui)

**Warning**<br>
The plugin mandatorily requires the [@fastify/reply-from](https://github.com/fastify/fastify-reply-from) plugin.

## Install
```bash
npm i @fgiova/fastify-rest-gateway @fastify/reply-from
```
### Usage
```js
const app = require("fastify")();
const replyFrom = require("@fastify/reply-from");
const fastifyRestGateway = require("@fgiova/fastify-rest-gateway");
app.register(replyFrom);
app.register(fastifyRestGateway, {
    services: [
        {
            host: "https://petstore.test.com",
            openApiUrl: "/open-api/json",
            remoteBaseUrl: "/v1/test/public-api/",
            gwBaseUrl: "/v1/test/",
            
        }
    ]
});
```

The plugin can be used in conjunction with [@fastify/swagger](https://github.com/fastify/fastify-swagger) and [@fastify/swagger-ui](https://github.com/fastify/fastify-swagger-ui) to produce an open-api contract of the routes exposed by the fastify-rest-gateway plugin.
```bash 
npm i @fgiova/fastify-rest-gateway @fastify/reply-from @fastify/swagger @fastify/swagger-ui
```

```js
const app = require("fastify")();
const fastifyRestGateway = require("@fgiova/fastify-rest-gateway");

await app.register(require("@fastify/reply-from"));
await app.register(fastifyRestGateway, {
    services: [
        {
            host: "https://petstore.test.com",
            openApiUrl: "/open-api/json",
            remoteBaseUrl: "/v1/test/public-api/",
            gwBaseUrl: "/v1/test/",
            
        }
    ]
});

await app.register(require("@fastify/swagger"), {
    mode: "dynamic",
    openapi: {
        ...
    }
});
await app.register(require("@fastify/swagge-ui"), {
    routePrefix: "/open-api",
});
```

The plugin can be used in conjunction with [@fastify/rate-limit](https://github.com/fastify/fastify-rate-limit) to restrict upstream accesses to the target microservice.
```bash 
npm i @fgiova/fastify-rest-gateway @fastify/reply-from @fastify/rate-limit
```

```js
const app = require("fastify")();
const fastifyRestGateway = require("@fgiova/fastify-rest-gateway");

await app.register(require("@fastify/reply-from"));
await app.register(require("@fastify/rate-limit"));
await app.register(fastifyRestGateway, {
    services: [
        {
            host: "https://petstore.test.com",
            openApiUrl: "/open-api/json",
            remoteBaseUrl: "/v1/test/public-api/",
            gwBaseUrl: "/v1/test/",
            hitLimit: {
                max: (req: FastifyRequest) => {
                    return 10;
                },
                keyGenerator: (req: FastifyRequest) => {
                    return `${req.ip}_test`;
                },
                timeWindow: 5000
            }
        }
    ]
});

await app.register(require("@fastify/swagger"), {
    mode: "dynamic",
    openapi: {
        ...
    }
});
await app.register(require("@fastify/swagge-ui"), {
    routePrefix: "/open-api",
});
```

This plugin can be used in conjunction with [@fastify/restartable](https://github.com/fastify/restartable) to reload the routes when open-api contracts of microservices are changed.
```bash 
npm i @fgiova/fastify-rest-gateway @fastify/reply-from @fastify/rate-limit @fastify/restartable
```

```js
const app = require("fastify")();
const fastifyRestGateway = require("@fgiova/fastify-rest-gateway");
const restartable = require("@fastify/restartable");


async function createApp (fastify, opts) {
    const app = fastify(opts)

    await app.register(require("@fastify/reply-from"));
    await app.register(require("@fastify/rate-limit"));
    await app.register(fastifyRestGateway, {
        services: [
            {
                host: "https://petstore.test.com",
                openApiUrl: "/open-api/json",
                remoteBaseUrl: "/v1/test/public-api/",
                gwBaseUrl: "/v1/test/",
                refreshTimeout: 60000, // each 60s reload open-api contract from host if are changed, restart fastify
                hitLimit: {
                    max: (req: FastifyRequest) => {
                        return 10;
                    },
                    keyGenerator: (req: FastifyRequest) => {
                        return `${req.ip}_test`;
                    },
                    timeWindow: 5000
                }
            }
        ]
    });

    await app.register(require("@fastify/swagger"), {
        mode: "dynamic",
        openapi: {
            ...
        }
    });
    await app.register(require("@fastify/swagge-ui"), {
        routePrefix: "/open-api",
    });

    return app;
}

const app = await restartable(createApp, { logger: true });
const host = await app.listen({ port: 3000 });

```


### Options
| Option                   | Type           | Description                                                                                                 |
|--------------------------|----------------|-------------------------------------------------------------------------------------------------------------|
| services                 | array          | The list of services to expose.                                                                             |
| services[].host          | string         | The host of the service.                                                                                    |
| services[].openApiUrl    | string         | The URL of the OpenApi JSON contract (default: /open-api/json).                                             |
| services[].remoteBaseUrl | string         | The baseUrl of the remote service.                                                                          |
| services[].gwBaseUrl     | string         | The baseUrl where the service will be connected on the gateway                                              |
| services[].tag           | string         | Optional tag for selecting target routes to expose (default: public-api)                                    |
| services[].hiddenTag     | string         | Optional tag for selecting target routes to expose, but hidden on fastify-swagger (default: private-api)    |
| services[].preHandler    | FastifyHandler | Optional Fastify Pre Handler function to add to each service route                                          |
| services[].hooks         | object         | Optional hooks for each route exposed                                                                       |
| services[].hitLimit      | object         | Optional limit configuration for each route exposed                                                         |
| defaultLimit             | object         | Optional default limit configuration                                                                        |
| gwTag                    | string         | Optional default tag for select target routes to expose (default: public-api)                               |
| gwHiddenTag              | string         | Optional default tag for select target routes to expose, but hidden on fastify-swagger  (default: X-HIDDEN) |
| ignoreHidden             | boolean        | Optional flag to ignore hidden routes                                                                       |
| refreshTimeout           | number         | Optional interval in ms for watching open-api contracts and reload through Fastify restartable              |

### Service Hooks
| Option                      | Type           | Description                                                                  |
|-----------------------------|----------------|------------------------------------------------------------------------------|
| onRequest                   | FastifyHandler | Optional Fastify OnRoute Handler function to add to each service route       |
| onResponse                  | FastifyHandler | Optional Fastify OnResponse Handler function to add to each service route    |
| onError                     | FastifyHandler | Optional Fastify OnError Handler function to add to each service route       |

### Service limit options
| Option       | Type               | Description                                                                                              |
|--------------|--------------------|----------------------------------------------------------------------------------------------------------|
| max          | number \| function | Optional sync/async Function or number maximum hit per timeWindow (default: 1000)                        |
| keyGenerator | function           | Optional sync/async function to generate a unique identifier for each incoming request (default: req.ip) |
| timeWindow   | number             | Optional the duration of the time window in ms (default: 60000)                                          |


## License
Licensed under [MIT](./LICENSE).

### Acknowledgements
This project is kindly sponsored by: isendu Srl [www.isendu.com](https://www.isendu.com)