import {test} from "tap";
import {setTimeout} from "timers/promises";
import fastify, {FastifyRequest, FastifyServerOptions} from "fastify";
// @ts-ignore
import gateway from "../../src/index";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyReplyFrom from "@fastify/reply-from";
import fastifyRateLimit from "@fastify/rate-limit";
import {restartable} from "@fastify/restartable";
import {clearInterval, setInterval} from "timers";
import {randomUUID} from "crypto";
import createHttpError from "http-errors";

type Fastify = typeof fastify;

test("Startup Gateway w restartable delayed ms endpoint", async t => {

	let postStart = false;
	const remoteService = fastify();
	remoteService.get("/v1/test/public-api/", async (request, reply) => {
		return reply.send({
			test: "test"
		});
	});
	remoteService.get("/v1/test/public-api/restart", async (request, reply) => {
		if(!postStart) throw new createHttpError.NotFound();
		return reply.send({
			test: "test-restarted"
		});
	});
	remoteService.get("/open-api/json", async (request, reply) => {
		if (!postStart) {
			return reply.send({
				"openapi": "3.0.1",
				"info": {
					"title": "Swagger Test",
					"version": "1.0.0"
				},
				"paths": {
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "public-api", "test" ],
						},
						"responses": {
							"200": {
								"type": "object",
								"properties" : {
									"test": {
										"type": "string"
									}
								}
							}
						}
					}
				}
			});
		}
		else {
			await setTimeout(3_000);
			return reply.send({
				"openapi": "3.0.1",
				"info": {
					"title": "Swagger Test",
					"version": "1.0.0"
				},
				"paths": {
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "public-api", "test" ],
						},
						"responses": {
							"200": {
								"type": "object",
								"properties" : {
									"test": {
										"type": "string"
									}
								}
							}
						}
					},
					"/v1/test/public-api/restart": {
						"get": {
							"tags": [ "public-api", "test" ],
						},
						"responses": {
							"200": {
								"type": "object",
								"properties" : {
									"test": {
										"type": "string"
									}
								}
							}
						}
					}
				}
			});
		}
	});
	await remoteService.ready();
	await remoteService.listen({
		port: 3000,
	});
	t.teardown(async () => {
		await remoteService.close();
	});
	const routesFile = `./routes-${randomUUID()}-cache.json`;
	async function createApp (fastify: Fastify, opts: FastifyServerOptions) {
		const app = fastify(opts);
		app.register(fastifySwagger, {
			openapi: {
				info: {
					title: "OpenApi api",
					description: "fastify swagger api",
					version: "0.0.0"
				},
				servers: [{
					url: "https://test.fgiova.com"
				}],
				components: {
					securitySchemes: {
						apiKey: {
							type: "apiKey",
							name: "x-api-key",
							in: "header"
						}
					}
				}
			},
			hideUntagged: true,
		});
		app.register(fastifySwaggerUi, {
			routePrefix: "/open-api",
		});
		app.register(fastifyReplyFrom);
		app.register(fastifyRateLimit, {
			global: false,
			max: 3000,
			ban: 1000,
			cache: 10000,
			keyGenerator: (request: FastifyRequest) => {
				return request.ip;
			},
			enableDraftSpec: true, // default false. Uses IEFT draft header standard
			addHeadersOnExceeding: { // default show all the response headers when rate limit is not reached
				"x-ratelimit-limit": true,
				"x-ratelimit-remaining": true,
				"x-ratelimit-reset": true
			},
			addHeaders: { // default show all the response headers when rate limit is reached
				"x-ratelimit-limit": true,
				"x-ratelimit-remaining": true,
				"x-ratelimit-reset": true,
				"retry-after": true
			}
		});
		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			refreshTimeout: 1_000,
			routesFile,
			services: [
				{
					host: "http://localhost:3000",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});
		return app
	}

	const app = await restartable(createApp, { keepAliveTimeout: 1, logger: {
			level: "debug"
		} });
	const res = await app.inject({
		path: "/v1/test/",
		method: "GET"
	});
	t.equal(res.statusCode, 200);
	t.same(res.json(), {
		test: "test"
	});
	postStart = true;
	await new Promise(resolve => {
		const testInterval = setInterval(async () => {
			if(app.restarted){
				clearInterval(testInterval);
				resolve(undefined);
			}
		}, 30);
	});
	const resRestart = await app.inject({
		path: "/v1/test/restart",
		method: "GET"
	});
	t.equal(resRestart.statusCode, 200);
	t.same(resRestart.json(), {
		test: "test-restarted"
	});
	await setTimeout(4_000);
	await app.close();
});