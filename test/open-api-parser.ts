import { test } from "tap";
import {OpenApiParser} from "../src/open-api-parser";

test("OpenApiParser Class", {only: true}, async  t => {
	t.beforeEach(async (t) => {

	});
	t.afterEach((t) => {

	});

	await t.test("Test Make Operation ID", async t => {
		const parser = new OpenApiParser();
		const operation = parser.makeOperationId("get", "/user/{name}");
		t.equal(operation, "getUserByName");
	});

	await t.test("Test Make URL", async t => {
		const parser = new OpenApiParser();
		const url = parser.makeURL("path/{param}");
		t.equal(url, "path/:param");
	});

	await t.test("Test copyProps", async t => {
		const parser = new OpenApiParser();
		const target = {};
		parser.copyProps({
			"props1": true,
			"props2": false,
			"x-copy": true
		}, target, ["props1"], true);
		t.same(target, {
			"props1": true,
			"x-copy": true
		});
	});
	await t.test("Test copyProps examples", async t => {
		const parser = new OpenApiParser();
		const target = {};
		parser.copyProps({
			"props1": true,
			"props2": false,
			"x-copy": true,
			"example": "test-value"
		}, target, ["example"], true);
		t.same(target, {
			"examples": ["test-value"],
			"x-copy": true
		});
	});

	await t.test("parseSecurity", async t => {
		const parser = new OpenApiParser();
		const securityMap = [
			{
				// @ts-ignore
				apiKey: []
			}
		];
		const security = parser.parseSecurity(securityMap);
		t.same(security, [{
			name: "apiKey",
			parameters: []
		}])
	});
	await t.test("parseSecurity empty", async t => {
		const parser = new OpenApiParser();
		const security = parser.parseSecurity(null);
		t.same(security, undefined);
	});

	await t.test("parseParams", async t => {
		const parser = new OpenApiParser();
		const parameters = parser.parseParams([{
				in: "path",
				name: "uuid",
				required: true,
				schema: {
					type: "string"
				}
		}]);
		t.same(parameters, {
			type: "object",
			properties:{
				uuid: {
					type: "string"
				}
			},
			required: [
				"uuid"
			]
		})
	});

	await t.test("parseQueryString Exploding", async t => {
		const parser = new OpenApiParser();
		const parameters = parser.parseQueryString([{
				name: "status",
				in: "query",
				description: "Status values that need to be considered for filter",
				required: true,
				explode: true,
				schema: {
					type: "array",
					items: {
						type: "string",
						default: "available",
						enum: [
							"available",
							"pending",
							"sold"
						]
					}
				}
			}]);
		t.same(parameters, {
			type: "array",
			items: {
				type: "string",
				default: "available",
				enum: [
					"available",
					"pending",
					"sold"
				]
			}
		})
	});

	await t.test("parseQueryString not Exploding", async t => {
		const parser = new OpenApiParser();
		const parameters = parser.parseQueryString([
			{
				"name": "username",
				"in": "query",
				"description": "The user name for login",
				"required": true,
				"schema": {
					"type": "string"
				}
			},
			{
				"name": "password",
				"in": "query",
				"description": "The password for login in clear text",
				"required": true,
				"schema": {
					"type": "string"
				}
			}
		])
		t.same(parameters, {
			type: "object",
			properties:{
				username: {
					type: "string",
					description: "The user name for login"
				},
				password: {
					type: "string",
					description: "The password for login in clear text"
				}
			},
			required: [
				"username",
				"password"
			]
		})
	});

	await t.test("parseParameters", async t => {
		const schema = {}
		const parser = new OpenApiParser();
		parser.parseParameters(schema, [
			{
				"name": "username",
				"in": "query",
				"description": "The user name for login",
				"required": true,
				"schema": {
					"type": "string"
				}
			},
			{
				"name": "password",
				"in": "query",
				"description": "The password for login in clear text",
				"required": true,
				"schema": {
					"type": "string"
				}
			},
			{
				in: "path",
				name: "uuid",
				required: true,
				schema: {
					type: "string"
				}
			},
			{
				"name": "api_key",
				"in": "header",
				"schema": {
					"type": "string"
				}
			}
		]);
		t.same(schema, {
			headers:{
				type: "object",
				properties: {
					api_key: {
						type: "string"
					}
				}
			},
			params: {
				type: "object",
				properties:{
					uuid: {
						type: "string"
					}
				},
				required: [
					"uuid"
				]
			},
			querystring: {
				type: "object",
				properties: {
					username: {
						type: "string",
						description: "The user name for login"
					},
					password: {
						type: "string",
						description: "The password for login in clear text"
					}
				},
				required: [
					"username",
					"password"
				]
			}
		})
	});
	await t.test("parseParameters no params", async t => {
		const schema = {}
		const parser = new OpenApiParser();
		parser.parseParameters(schema, [
			{
				"name": "username",
				"in": "query",
				"description": "The user name for login",
				"required": true,
				"schema": {
					"type": "string"
				}
			},
			{
				"name": "password",
				"in": "query",
				"description": "The password for login in clear text",
				"required": true,
				"schema": {
					"type": "string"
				}
			},
			{
				"name": "api_key",
				"in": "header",
				"schema": {
					"type": "string"
				}
			}
		]);
		t.same(schema, {
			headers:{
				type: "object",
				properties: {
					api_key: {
						type: "string"
					}
				}
			},
			querystring: {
				type: "object",
				properties: {
					username: {
						type: "string",
						description: "The user name for login"
					},
					password: {
						type: "string",
						description: "The password for login in clear text"
					}
				},
				required: [
					"username",
					"password"
				]
			}
		})
	});

	await t.test("parseBody", async t => {
		const parser = new OpenApiParser();
		const body = parser.parseBody({
			content: {
				"application/json": {
					schema: {
						type: "object",
						properties: {
							id: {
								"type": "integer",
								"format": "int64"
							},
							name: {
								"type": "string"
							}
						}
					}
				}
			}
		});
		t.same(body, {
			type: "object",
			properties: {
				id: {
					"type": "integer",
					"format": "int64"
				},
				name: {
					"type": "string"
				}
			}
		})
	});

	await t.test("parseBody empty", async t => {
		const parser = new OpenApiParser();
		const body = parser.parseBody({});
		t.same(body, undefined);
	});

	await t.test("parseResponses", async t => {
		const parser = new OpenApiParser();
		const responses = parser.parseResponses({
			"200": {
				"description": "successful operation",
				"content": {
					"application/json": {
						schema: {
							type: "object",
							properties: {
								id: {
									"type": "integer",
									"format": "int64"
								},
								name: {
									"type": "string"
								}
							}
						}
					}
				}
			}
		});
		t.same(responses, {
			"200" : {
				type: "object",
				properties: {
					id: {
						"type": "integer",
						"format": "int64"
					},
					name: {
						"type": "string"
					}
				}
			}
		})
	});

	await t.test("makeSchema", async t => {
		const parser = new OpenApiParser();
		const schema = parser.makeSchema({}, {
			"tags": [
				"store"
			],
			"summary": "Place an order for a pet",
			"operationId": "placeOrder",
			"requestBody": {
				"description": "order placed for purchasing the pet",
				"content": {
					"*/*": {
						"schema": {
							"type": "object",
							"properties": {
								"id": {
									"type": "integer",
									"format": "int64"
								},
							}
						}
					}
				},
				"required": true
			},
			"responses": {
				"200": {
					"description": "successful operation",
					"content": {
						"application/json": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									},
								}
							}
						}
					}
				},
				"400": {
					"description": "Invalid Order",
					"content": {}
				}
			},
			"x-codegen-request-body-name": "body"
		})
		t.same(schema,{
				tags: [ "store" ],
				summary: "Place an order for a pet",
				operationId: "placeOrder",
				"x-codegen-request-body-name": "body",
				body: {
					type: "object",
					properties: {
						id: {
							type: "integer",
							format: "int64"
						}
					}
				},
				response: {
					"200": {
						type: "object",
						properties: {
							id: {
								type: "integer",
								format: "int64"
							}
						}
					}
				}
			}
		)

	});
	await t.test("makeSchema no body", async t => {
		const parser = new OpenApiParser();
		const schema = parser.makeSchema({}, {
			"tags": [
				"store"
			],
			"summary": "Place an order for a pet",
			"operationId": "placeOrder",
			"responses": {
				"200": {
					"description": "successful operation",
					"content": {
						"application/json": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									},
								}
							}
						}
					}
				},
				"400": {
					"description": "Invalid Order",
					"content": {}
				}
			},
			"x-codegen-request-body-name": "body"
		})
		t.same(schema,{
				tags: [ "store" ],
				summary: "Place an order for a pet",
				operationId: "placeOrder",
				"x-codegen-request-body-name": "body",
				response: {
					"200": {
						type: "object",
						properties: {
							id: {
								type: "integer",
								format: "int64"
							}
						}
					}
				}
			}
		)

	});
	await t.test("makeSchema no responses", async t => {
		const parser = new OpenApiParser();
		const schema = parser.makeSchema({}, {
			"tags": [
				"store"
			],
			"summary": "Place an order for a pet",
			"operationId": "placeOrder",
			"requestBody": {
				"description": "order placed for purchasing the pet",
				"content": {
					"*/*": {
						"schema": {
							"type": "object",
							"properties": {
								"id": {
									"type": "integer",
									"format": "int64"
								},
							}
						}
					}
				},
				"required": true
			},
			"x-codegen-request-body-name": "body"
		})
		t.same(schema,{
				tags: [ "store" ],
				summary: "Place an order for a pet",
				operationId: "placeOrder",
				"x-codegen-request-body-name": "body",
				body: {
					type: "object",
					properties: {
						id: {
							type: "integer",
							format: "int64"
						}
					}
				}
			}
		)

	});

	await t.test("processOperation", async t => {
		const parser = new OpenApiParser();
		parser.processOperation("/test", "post",  {
			"tags": [
				"store"
			],
			"summary": "Place an order for a pet",
			"operationId": "placeOrder",
			"requestBody": {
				"description": "order placed for purchasing the pet",
				"content": {
					"*/*": {
						"schema": {
							"type": "object",
							"properties": {
								"id": {
									"type": "integer",
									"format": "int64"
								},
							}
						}
					}
				},
				"required": true
			},
			"responses": {
				"200": {
					"description": "successful operation",
					"content": {
						"application/json": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									},
								}
							}
						}
					}
				},
				"400": {
					"description": "Invalid Order",
					"content": {}
				}
			},
			"security": [{
				"apiKey": []
			}],
			"x-codegen-request-body-name": "body"
		}, {});
		const parsed = parser.parse({});
		const routes = parsed.routes;

		t.same(routes, [{
			"method": "POST",
			"url": "/test",
			"schema": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"x-codegen-request-body-name": "body",
				"body": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64"
						}
					}
				},
				"response": {
					"200": {
						"type": "object",
						"properties": {
							"id": {
								"type": "integer",
								"format": "int64"
							}
						}
					}
				}
			},
			"operationId": "placeOrder",
			"openapiSource": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"requestBody": {
					"description": "order placed for purchasing the pet",
					"content": {
						"*/*": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									}
								}
							}
						}
					},
					"required": true
				},
				"responses": {
					"200": {
						"description": "successful operation",
						"content": {
							"application/json": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										}
									}
								}
							}
						}
					},
					"400": {
						"description": "Invalid Order",
						"content": {}
					}
				},
				"security": [
					{
						"apiKey": []
					}
				],
				"x-codegen-request-body-name": "body"
			},
			"security": [
				{
					"name": "apiKey",
					"parameters": []
				}
			]
		}]);
	});
	await t.test("processOperation w/o operation Id", async t => {
		const parser = new OpenApiParser();
		parser.processOperation("/test", "post",  {
			"tags": [
				"store"
			],
			"summary": "Place an order for a pet",
			"requestBody": {
				"description": "order placed for purchasing the pet",
				"content": {
					"*/*": {
						"schema": {
							"type": "object",
							"properties": {
								"id": {
									"type": "integer",
									"format": "int64"
								},
							}
						}
					}
				},
				"required": true
			},
			"responses": {
				"200": {
					"description": "successful operation",
					"content": {
						"application/json": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									},
								}
							}
						}
					}
				},
				"400": {
					"description": "Invalid Order",
					"content": {}
				}
			},
			"security": [{
				"apiKey": []
			}],
			"x-codegen-request-body-name": "body"
		}, {});
		const parsed = parser.parse({});
		const routes = parsed.routes;

		t.same(routes, [{
			"method": "POST",
			"url": "/test",
			"schema": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"x-codegen-request-body-name": "body",
				"body": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64"
						}
					}
				},
				"response": {
					"200": {
						"type": "object",
						"properties": {
							"id": {
								"type": "integer",
								"format": "int64"
							}
						}
					}
				}
			},
			"operationId": "postTest",
			"openapiSource": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"requestBody": {
					"description": "order placed for purchasing the pet",
					"content": {
						"*/*": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									}
								}
							}
						}
					},
					"required": true
				},
				"responses": {
					"200": {
						"description": "successful operation",
						"content": {
							"application/json": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										}
									}
								}
							}
						}
					},
					"400": {
						"description": "Invalid Order",
						"content": {}
					}
				},
				"security": [
					{
						"apiKey": []
					}
				],
				"x-codegen-request-body-name": "body"
			},
			"security": [
				{
					"name": "apiKey",
					"parameters": []
				}
			]
		}]);
	});
	await t.test("processOperation w/o security", async t => {
		const parser = new OpenApiParser();
		parser.processOperation("/test", "post",  {
			"tags": [
				"store"
			],
			"summary": "Place an order for a pet",
			"operationId": "placeOrder",
			"requestBody": {
				"description": "order placed for purchasing the pet",
				"content": {
					"*/*": {
						"schema": {
							"type": "object",
							"properties": {
								"id": {
									"type": "integer",
									"format": "int64"
								},
							}
						}
					}
				},
				"required": true
			},
			"responses": {
				"200": {
					"description": "successful operation",
					"content": {
						"application/json": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									},
								}
							}
						}
					}
				},
				"400": {
					"description": "Invalid Order",
					"content": {}
				}
			},
			"x-codegen-request-body-name": "body"
		}, {});
		const parsed = parser.parse({});
		const routes = parsed.routes;

		t.same(routes, [{
			"method": "POST",
			"url": "/test",
			"schema": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"x-codegen-request-body-name": "body",
				"body": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64"
						}
					}
				},
				"response": {
					"200": {
						"type": "object",
						"properties": {
							"id": {
								"type": "integer",
								"format": "int64"
							}
						}
					}
				}
			},
			"security": undefined,
			"operationId": "placeOrder",
			"openapiSource": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"requestBody": {
					"description": "order placed for purchasing the pet",
					"content": {
						"*/*": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									}
								}
							}
						}
					},
					"required": true
				},
				"responses": {
					"200": {
						"description": "successful operation",
						"content": {
							"application/json": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										}
									}
								}
							}
						}
					},
					"400": {
						"description": "Invalid Order",
						"content": {}
					}
				},
				"x-codegen-request-body-name": "body"
			}
		}]);
	});


	await t.test("processPahts", async t => {
		const parser = new OpenApiParser();
		parser.processPaths({
			"/test/{id}": { "post":{
					"tags": [
						"store"
					],
					"summary": "Place an order for a pet",
					"operationId": "placeOrder",
					"parameters": [
						{
							"name": "id",
							"in": "path",
							"required": true,
							"schema": {
								"type": "integer",
								"format": "int64"
							}
						}
					],
					"requestBody": {
						"description": "order placed for purchasing the pet",
						"content": {
							"*/*": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										},
									}
								}
							}
						},
						"required": true
					},
					"responses": {
						"200": {
							"description": "successful operation",
							"content": {
								"application/json": {
									"schema": {
										"type": "object",
										"properties": {
											"id": {
												"type": "integer",
												"format": "int64"
											},
										}
									}
								}
							}
						},
						"400": {
							"description": "Invalid Order",
							"content": {}
						}
					},
					"security": [{
						"apiKey": []
					}],
					"x-codegen-request-body-name": "body"
				}}
		});
		const parsed = parser.parse({});
		const routes = parsed.routes;

		t.same(routes, [{
			"method": "POST",
			"url": "/test/:id",
			"schema": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"x-codegen-request-body-name": "body",
				"params": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64",
						},
					},
					"required": [
						"id",
					],
				},
				"body": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64"
						}
					}
				},
				"response": {
					"200": {
						"type": "object",
						"properties": {
							"id": {
								"type": "integer",
								"format": "int64"
							}
						}
					}
				}
			},
			"operationId": "placeOrder",
			"openapiSource": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"parameters": [
					{
						"name": "id",
						"in": "path",
						"required": true,
						"schema": {
							"type": "integer",
							"format": "int64"
						}
					}
				],
				"requestBody": {
					"description": "order placed for purchasing the pet",
					"content": {
						"*/*": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									}
								}
							}
						}
					},
					"required": true
				},
				"responses": {
					"200": {
						"description": "successful operation",
						"content": {
							"application/json": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										}
									}
								}
							}
						}
					},
					"400": {
						"description": "Invalid Order",
						"content": {}
					}
				},
				"security": [
					{
						"apiKey": []
					}
				],
				"x-codegen-request-body-name": "body"
			},
			"security": [
				{
					"name": "apiKey",
					"parameters": []
				}
			]
		}]);
	});
	await t.test("processPahts invalid method", async t => {
		const parser = new OpenApiParser();
		parser.processPaths({
			"/test/{id}": {
				"foo":{
					"tags": [
						"store"
					],
					"summary": "Place an order for a pet",
					"operationId": "placeOrder",
				}}
		});
		const parsed = parser.parse({});
		const routes = parsed.routes;

		t.same(routes, []);
	});

	await t.test("parse", async t => {
		const parser = new OpenApiParser();
		const parsed =parser.parse(
			{
				"openapi": "3.0.3",
				"components": {
					"securitySchemes": {
						"apiKey": {
							"type": "apiKey",
							"name": "x-api-key",
							"in": "header"
						}
					},
					"requestBodies": {
						"testBody": {
							"description": "test body",
							"content": {
								"*/*": {
									"schema": {
										"type": "object",
										"properties": {
											"id": {
												"type": "integer",
											}
										}
									}
								}
							}
						}
					}
				},
				"paths": {
					"/test/{id}": {
						"post":{
							"tags": [
								"store"
							],
							"summary": "Place an order for a pet",
							"operationId": "placeOrder",
							"parameters": [
								{
									"name": "id",
									"in": "path",
									"required": true,
									"schema": {
										"type": "integer",
										"format": "int64"
									}
								}
							],
							"requestBody": {
								"description": "order placed for purchasing the pet",
								"content": {
									"*/*": {
										"schema": {
											"type": "object",
											"properties": {
												"id": {
													"type": "integer",
													"format": "int64"
												},
											}
										}
									}
								},
								"required": true
							},
							"responses": {
								"200": {
									"description": "successful operation",
									"content": {
										"application/json": {
											"schema": {
												"type": "object",
												"properties": {
													"id": {
														"type": "integer",
														"format": "int64"
													},
												}
											}
										}
									}
								},
								"400": {
									"description": "Invalid Order",
									"content": {}
								}
							},
							"security": [{
								"apiKey": []
							}],
							"x-codegen-request-body-name": "body"
						}}
				}
			}
		);
		const routes = parsed.routes;

		t.same(routes, [{
			"method": "POST",
			"url": "/test/:id",
			"schema": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"x-codegen-request-body-name": "body",
				"params": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64",
						},
					},
					"required": [
						"id",
					],
				},
				"body": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64"
						}
					}
				},
				"response": {
					"200": {
						"type": "object",
						"properties": {
							"id": {
								"type": "integer",
								"format": "int64"
							}
						}
					}
				}
			},
			"operationId": "placeOrder",
			"openapiSource": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"parameters": [
					{
						"name": "id",
						"in": "path",
						"required": true,
						"schema": {
							"type": "integer",
							"format": "int64"
						}
					}
				],
				"requestBody": {
					"description": "order placed for purchasing the pet",
					"content": {
						"*/*": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									}
								}
							}
						}
					},
					"required": true
				},
				"responses": {
					"200": {
						"description": "successful operation",
						"content": {
							"application/json": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										}
									}
								}
							}
						}
					},
					"400": {
						"description": "Invalid Order",
						"content": {}
					}
				},
				"security": [
					{
						"apiKey": []
					}
				],
				"x-codegen-request-body-name": "body"
			},
			"security": [
				{
					"name": "apiKey",
					"parameters": []
				}
			]
		}]);
	});
	await t.test("parse no security", async t => {
		const parser = new OpenApiParser();
		const parsed =parser.parse(
			{
				"openapi": "3.0.3",
				"components": {
					"requestBodies": {
						"testBody": {
							"description": "test body",
							"content": {
								"*/*": {
									"schema": {
										"type": "object",
										"properties": {
											"id": {
												"type": "integer",
											}
										}
									}
								}
							}
						}
					}
				},
				"paths": {
					"/test/{id}": {
						"post":{
							"tags": [
								"store"
							],
							"summary": "Place an order for a pet",
							"operationId": "placeOrder",
							"parameters": [
								{
									"name": "id",
									"in": "path",
									"required": true,
									"schema": {
										"type": "integer",
										"format": "int64"
									}
								}
							],
							"requestBody": {
								"description": "order placed for purchasing the pet",
								"content": {
									"*/*": {
										"schema": {
											"type": "object",
											"properties": {
												"id": {
													"type": "integer",
													"format": "int64"
												},
											}
										}
									}
								},
								"required": true
							},
							"responses": {
								"200": {
									"description": "successful operation",
									"content": {
										"application/json": {
											"schema": {
												"type": "object",
												"properties": {
													"id": {
														"type": "integer",
														"format": "int64"
													},
												}
											}
										}
									}
								},
								"400": {
									"description": "Invalid Order",
									"content": {}
								}
							},
							"x-codegen-request-body-name": "body"
						}}
				}
			}
		);
		const routes = parsed.routes;

		t.same(routes, [{
			"method": "POST",
			"url": "/test/:id",
			"schema": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"x-codegen-request-body-name": "body",
				"params": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64",
						},
					},
					"required": [
						"id",
					],
				},
				"body": {
					"type": "object",
					"properties": {
						"id": {
							"type": "integer",
							"format": "int64"
						}
					}
				},
				"response": {
					"200": {
						"type": "object",
						"properties": {
							"id": {
								"type": "integer",
								"format": "int64"
							}
						}
					}
				}
			},
			"operationId": "placeOrder",
			"openapiSource": {
				"tags": [
					"store"
				],
				"summary": "Place an order for a pet",
				"operationId": "placeOrder",
				"parameters": [
					{
						"name": "id",
						"in": "path",
						"required": true,
						"schema": {
							"type": "integer",
							"format": "int64"
						}
					}
				],
				"requestBody": {
					"description": "order placed for purchasing the pet",
					"content": {
						"*/*": {
							"schema": {
								"type": "object",
								"properties": {
									"id": {
										"type": "integer",
										"format": "int64"
									}
								}
							}
						}
					},
					"required": true
				},
				"responses": {
					"200": {
						"description": "successful operation",
						"content": {
							"application/json": {
								"schema": {
									"type": "object",
									"properties": {
										"id": {
											"type": "integer",
											"format": "int64"
										}
									}
								}
							}
						}
					},
					"400": {
						"description": "Invalid Order",
						"content": {}
					}
				},
				"x-codegen-request-body-name": "body"
			},
			"security": undefined
		}]);
	});

	await t.test("changeExampleSyntax property type object - example as simple string", async t => {

		const parser = new OpenApiParser();
		const schema = {
			properties:{
				test: {
					type: "object",
					properties: {
						testKey: {
							type: "string",
							example: "testValue"
						}
					}
				}
			}
		};
		parser.changeExampleSyntax(schema);
		t.same(schema, {
			properties:{
				test: {
					type: "object",
					properties: {
						testKey: {
							type: "string",
							examples: ["testValue"]
						}
					}
				}
			}
		})

	});
	await t.test("changeExampleSyntax property type object - example as object", async t => {

		const parser = new OpenApiParser();
		const schema = {
			properties:{
				test: {
					type: "object",
					properties: {
						testKey: {
							type: "string",
							examples: {
								testValue: "testValue"
							}
						}
					}
				}
			}
		};
		parser.changeExampleSyntax(schema);
		t.same(schema, {
			properties:{
				test: {
					type: "object",
					properties: {
						testKey: {
							type: "string",
							examples: ["testValue"]
						}
					}
				}
			}
		})

	});
	await t.test("changeExampleSyntax property type array(items string) - example as simple string", async t => {

		const parser = new OpenApiParser();
		const schema = {
			properties:{
				test: {
					type: "array",
					items: {
						type: "string",
						example: "testValue"
					}
				}
			}
		};
		parser.changeExampleSyntax(schema);
		t.same(schema, {
			properties:{
				test: {
					type: "array",
					items: {
						type: "string",
						examples: ["testValue"]
					}
				}
			}
		})

	});
	await t.test("changeExampleSyntax property type array(items string) - example as object", async t => {

		const parser = new OpenApiParser();
		const schema = {
			properties:{
				test: {
					type: "array",
					items: {
						type: "string",
						examples: {
							testValue: "testValue"
						}
					}
				}
			}
		};
		parser.changeExampleSyntax(schema);
		t.same(schema, {
			properties:{
				test: {
					type: "array",
					items: {
						type: "string",
						examples: ["testValue"]
					}
				}
			}
		})

	});
	await t.test("changeExampleSyntax property type array(items object) - example as simple string", async t => {

		const parser = new OpenApiParser();
		const schema = {
			properties:{
				test: {
					type: "array",
					items: {
						type: "object",
						properties: {
							testKey: {
								type: "string",
								example: "testValue"
							}
						}
					}
				}
			}
		};
		parser.changeExampleSyntax(schema);
		t.same(schema, {
			properties:{
				test: {
					type: "array",
					items: {
						type: "object",
						properties: {
							testKey: {
								type: "string",
								examples: ["testValue"]
							}
						}

					}
				}
			}
		})

	});
});