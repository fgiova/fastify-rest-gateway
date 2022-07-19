import {test} from "tap";
import fastify, {FastifyInstance, FastifyRequest} from "fastify";
import {makeRoute} from "../src/makeRoute";
import {MockAgent, MockPool, setGlobalDispatcher} from "undici";
import fastifyReplyFrom from "@fastify/reply-from";
import fastifyRateLimit from "@fastify/rate-limit";
import {Type} from "@sinclair/typebox";
// @ts-ignore
import createError from "http-errors";

test("Make routes for fastify", {only: true}, async  t => {
	t.beforeEach(async (t) => {
		const app = fastify();
		const mockAgent = new MockAgent();
		const mockPool = mockAgent.get("https://test.fgiova.com");
		app.register(fastifyReplyFrom, {
			undici: mockPool as any
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
		setGlobalDispatcher(mockAgent);
		t.context = {
			app,
			mockPool
		}
	});
	t.afterEach(async (t) => {
		await t.context.app.close();
	});

	await t.test("Base route", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: true}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET"
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: true});
	});

	await t.test("Simple route", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});

	await t.test("Simple route w format", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		const date = (new Date()).toISOString();
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: date}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String({format:"date-time"})
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: date});
	});
	await t.test("Simple route w format unsupported", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							test: {
								type: "string",
								format: "password"
							}
						}
					}
				}
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});
	await t.test("Simple route w format unsupported nested", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {payload: {test: "test"}}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: {
						type: "object",
						properties: {
							payload: {
								type: "object",
								properties: {
									test: {
										type: "string",
										format: "password"
									}
								}
							}
						}
					}
				}
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {payload: {test: "test"}});
	});

	await t.test("Simple route w GWPrefix", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
			gwPrefix: "/testone"
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/testone/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});

	await t.test("Simple route w remotePrefix", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/testone/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
			remotePrefix: "/testone"
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});

	await t.test("Simple route w/error hook", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(500, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
			hooks: {
				onRequest: async () => {
					throw new createError.InternalServerError();
				}
			}
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 500);
	});
	await t.test("Simple route w/abort hook", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(500, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
			hooks: {
				onRequest: async (request, reply) => {
					reply.send({test: "no-test"})
					return true;
				}
			}
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "no-test"});
	});

	await t.test("Simple route w security", async t => {
		const app = t.context.app as FastifyInstance;
		app.decorate("isenduAuth", (constraint: any) => {
			const auth = async (request, reply) => {
				return constraint.isApiKey
			}
			return auth.bind({constraint});
		});
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			},
			security: [
				{
					apiKey: []
				}
			]
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});

	await t.test("Simple route w limit", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			},
			limit: {
				max: 30
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});
	await t.test("Simple route w limit exceeded", async t => {
		const app = t.context.app as FastifyInstance;
		app.decorate("isenduAuth", (constraint: any) => {
			const auth = async (request, reply) => {
				return constraint.isApiKey
			}
			return auth.bind({constraint});
		});
		app.decorateRequest("authApi", {
			limit: 1
		});
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "GET",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			},
			limit: {
				max: 30
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		await app.inject({
			path: "/test",
			method: "GET"
		});
		const res = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res.statusCode, 429);
	});

	await t.test("Simple route multi method", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "GET"
		}).reply(200, () => {
			return {test: "test-get"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		mockPool.intercept({
			path: "/test",
			method: "POST"
		}).reply(200, () => {
			return {test: "test-post"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
		}, app);
		await app.ready();
		const res_get = await app.inject({
			path: "/test",
			method: "GET"
		});
		t.equal(res_get.statusCode, 200);
		t.same(res_get.json(), {test: "test-get"});

		const res_post = await app.inject({
			path: "/test",
			method: "POST"
		});
		t.equal(res_post.statusCode, 200);
		t.same(res_post.json(), {test: "test-post"});
	});

	await t.test("Simple route body size-limit", async t => {
		const app = t.context.app as FastifyInstance;
		const mockPool = t.context.mockPool as MockPool;
		mockPool.intercept({
			path: "/test",
			method: "POST"
		}).reply(200, () => {
			return {test: "test"}
		}, {
			headers: {
				"content-type" :"application/json"
			}
		});
		makeRoute({
			url: "/test",
			method: "POST",
			schema: {
				response: {
					200: Type.Object({
						test: Type.String()
					})
				}
			}
		}, {
			host: "https://test.fgiova.com",
			bodyLimit: 10,
		}, app);
		await app.ready();
		const res_fail = await app.inject({
			path: "/test",
			method: "POST",
			payload: {
				"12345": "12345"
			}
		});
		t.equal(res_fail.statusCode, 413);

		const res = await app.inject({
			path: "/test",
			method: "POST"
		});
		t.equal(res.statusCode, 200);
		t.same(res.json(), {test: "test"});
	});
});