import {test} from "tap";
import fastify, {FastifyInstance} from "fastify";
import {MockAgent} from "undici";
import gateway from "../src/index";
import fastifySwagger from "@fastify/swagger";
import fastifyReplyFrom from "@fastify/reply-from";

test("Gateway", {only: true}, async t => {
	t.beforeEach(async (t) => {
		const mockAgentOAPI = new MockAgent();
		const mockPoolOAPI = mockAgentOAPI.get("https://test.fgiova.com");
		const mockAgentGW = new MockAgent();
		const mockPoolGW = mockAgentGW.get("https://test.fgiova.com");

		const app = fastify();
		app.decorate("isenduAuth", (constraint: any) => {
			const auth = async (request, reply) => {
				return constraint.isApiKey
			}
			return auth.bind({constraint});
		});
		app.decorateRequest("authApi", {
			companyId: 1,
			limit: 1
		});
		app.register(fastifySwagger, {
			openapi: {
				info: {
					title: "OpenApi api",
					description: "fastify swagger api",
					version: "0.0.0"
				},
				servers: [{
					url: "http://localhost"
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
			exposeRoute: true,
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
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
			undiciAgent: t.context.mockPoolOAPI,
			services: [
				{
					host: "https://test.fgiova.com",
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
					"/v1/test/public-api/": {
						"get": {
							"tags": [ "public-api", "hidden-public-api" ],
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
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
							"tags": [ "hidden-gateway" ],
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
					remotePrefix: "/v1/test/public-api/",
					hiddenTag: "hidden-gateway",
					gwPrefix: "/v1/test/"
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
					remotePrefix: "/v1/test/public-api/",
					gwPrefix: "/v1/test/"
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
});