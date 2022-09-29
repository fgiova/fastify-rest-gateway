import {test} from "tap";
import fastify, {FastifyInstance, FastifyRequest} from "fastify";
import {MockAgent} from "undici";
import gateway from "../src/index";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import fastifyReplyFrom from "@fastify/reply-from";
import fastifyRateLimit from "@fastify/rate-limit";

test("Gateway", {only: true}, async t => {
	t.beforeEach(async (t) => {
		const mockAgentOAPI = new MockAgent();
		const mockPoolOAPI = mockAgentOAPI.get("https://test.fgiova.com");
		const mockAgentGW = new MockAgent();
		const mockPoolGW = mockAgentGW.get("https://test.fgiova.com");

		const app = fastify();
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
		app.register(fastifyReplyFrom, {
			undici: mockPoolGW as any
		});
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

		t.context = {
			app,
			mockAgentOAPI,
			mockPoolOAPI,
			mockAgentGW,
			mockPoolGW
		}
	});
	t.afterEach(async (t) => {
		await t.context.app.close();
	});

	await t.test("Startup Gateway", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
		.reply(200, {
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
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
		.reply(200, {
			test: "test"
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
	});
	await t.test("Startup Gateway no open-api", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
		.reply(404, "Not Found");

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
	});

	await t.test("Startup Gateway limit default", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
			.reply(200, {
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
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 1
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
		const resLimit = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(resLimit.statusCode, 429);
	});
	await t.test("Startup Gateway limit service", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
			.reply(200, {
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
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/",
					hitLimit: {
						max: 1
					}
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
		const resLimit = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(resLimit.statusCode, 429);
	});

	await t.test("Startup Gateway custom tag", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
			.reply(200, {
				"openapi": "3.0.1",
				"info": {
					"title": "Swagger Test",
					"version": "1.0.0"
				},
				"paths": {
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "gateway", "test" ],
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
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					tag: "gateway",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
	});

	await t.test("Error Microservice Endpoint", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		}).replyWithError(new Error("kaboom"))

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			ignoreHidden: true,
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 404);
	});
	await t.test("Error Microservice Endpoint HTTP Error", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		}).reply(500, {});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			ignoreHidden: true,
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 404);
	});

	await t.test("Error Microservice Endpoint not json", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		}).reply(200, "test");

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			ignoreHidden: true,
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 404);
	});

	await t.test("Error Microservice Endpoint Hidden route", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
		.reply(200, {
			"openapi": "3.0.1",
			"info": {
				"title": "Swagger Test",
				"version": "1.0.0"
			},
			"paths": {
				"/v1/test/private-api/": {
					"get": {
						"tags": [ "public-api", "private-api" ],
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
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/private-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/private-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/open-api/json",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json().paths, {});
	});

	await t.test("Microservice without public-api paths", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
			.reply(200, {
				"openapi": "3.0.1",
				"info": {
					"title": "Swagger Test",
					"version": "1.0.0"
				},
				"paths": {
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "test" ],
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
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 404);
	});

	await t.test("Microservice with hidden and ignored path", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
			.reply(200, {
				"openapi": "3.0.1",
				"info": {
					"title": "Swagger Test",
					"version": "1.0.0"
				},
				"paths": {
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "public-api" ],
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
					"/v1/test/private-api/": {
						"get": {
							"tags": [ "hidden-endpoint" ],
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
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test-public"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			ignoreHidden: true,
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/",
					gwBaseUrl: "/v1/test/",
					hiddenTag: "hidden-endpoint",
				},

			],
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/public-api/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		const resPrivate = await app.inject({
			path: "/v1/test/private-api/",
			method: "GET"
		});
		t.equal(resPrivate.statusCode, 404);

	});
});

test("Gateway", {only: true}, async t => {
	t.beforeEach(async (t) => {
		const mockAgentOAPI = new MockAgent();
		const mockPoolOAPI = mockAgentOAPI.get("https://test.fgiova.com");
		const mockAgentGW = new MockAgent();
		const mockPoolGW = mockAgentGW.get("https://test.fgiova.com");

		const app = fastify();
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
			hiddenTag: "hidden-gateway",
			hideUntagged: true
		});
		app.register(fastifySwaggerUi, {
			routePrefix: "/open-api",
		});
		app.register(fastifyReplyFrom, {
			undici: mockPoolGW as any
		});

		t.context = {
			app,
			mockAgentOAPI,
			mockPoolOAPI,
			mockAgentGW,
			mockPoolGW
		}
	});
	t.afterEach(async (t) => {
		await t.context.app.close();
	});

	await t.test("Error Microservice Endpoint Hidden route custom tag", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
			.reply(200, {
				"openapi": "3.0.1",
				"info": {
					"title": "Swagger Test",
					"version": "1.0.0"
				},
				"paths": {
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "hidden-gateway", "public-route" ],
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
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
			.reply(200, {
				test: "test"
			}, {
				headers: {
					"content-type" :"application/json"
				}
			});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			gwHiddenTag: "hidden-gateway",
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					hiddenTag: "hidden-gateway",
					tag: "public-route",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/open-api/json",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json().paths, {});
	});
});

test("Gateway w/o swagger", async t => {
	t.beforeEach(async (t) => {
		const mockAgentOAPI = new MockAgent();
		const mockPoolOAPI = mockAgentOAPI.get("https://test.fgiova.com");
		const mockAgentGW = new MockAgent();
		const mockPoolGW = mockAgentGW.get("https://test.fgiova.com");

		const app = fastify();
		app.register(fastifyReplyFrom, {
			undici: mockPoolGW as any
		});

		t.context = {
			app,
			mockAgentOAPI,
			mockPoolOAPI,
			mockAgentGW,
			mockPoolGW
		}
	});
	t.afterEach(async (t) => {
		await t.context.app.close();
	});

	await t.test("Startup Gateway", async t => {
		const app = t.context.app as FastifyInstance;
		t.context.mockPoolOAPI.intercept({
			path: "/open-api/json",
			method: "GET"
		})
		.reply(200, {
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
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});

		t.context.mockPoolGW.intercept({
			path: "/v1/test/public-api/",
			method: "GET"
		})
		.reply(200, {
			test: "test"
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
	});
});

test("Gateway w/o mocks", async t => {
	t.beforeEach(async (t) => {
		const app = fastify();
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

		t.context = {
			app
		}
	});
	t.afterEach(async (t) => {
		await t.context.app.close();
	});

	await t.test("Startup Gateway custom Agent Options", async t => {
		const app = t.context.app as FastifyInstance;
		const appRemote = fastify();
		t.teardown(async () => {
			await appRemote.close();
		})
		appRemote.get("/open-api/json", async (req, res) => {
			res.send({
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
		});
		appRemote.get("/v1/test/public-api/", async (req, res) => {
			res.send({
				test: "test"
			});
		});
		await appRemote.ready();
		await appRemote.listen({
			port: 0,
			host: "localhost"
		});
		// @ts-ignore
		const port = appRemote.server.address().port;

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			undiciOpts: {
				keepAliveMaxTimeout: 5000,
				connections: 2,
				rejectUnauthorized: true
			},
			services: [
				{
					host: `http://localhost:${port}`,
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
	});
	await t.test("Startup Gateway custom No Agent Options", async t => {
		const app = t.context.app as FastifyInstance;
		const appRemote = fastify();
		t.teardown(async () => {
			await appRemote.close();
		})
		appRemote.get("/open-api/json", async (req, res) => {
			res.send({
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
		});
		appRemote.get("/v1/test/public-api/", async (req, res) => {
			res.send({
				test: "test"
			});
		});
		await appRemote.ready();
		await appRemote.listen({
			port: 0,
			host: "localhost"
		});
		// @ts-ignore
		const port = appRemote.server.address().port;

		app.register(gateway, {
			defaultLimit: {
				max: 2
			},
			services: [
				{
					host: `http://127.0.0.1:${port}`,
					remoteBaseUrl: "/v1/test/public-api/",
					gwBaseUrl: "/v1/test/"
				},

			]
		});

		await app.ready();
		const res = await app.inject({
			path: "/v1/test/",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {
			test: "test"
		});
	});
})