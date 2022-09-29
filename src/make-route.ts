import {
	FastifyInstance,
	FastifyReply,
	FastifyRequest, FastifySchema, HTTPMethods, preHandlerHookHandler, RawReplyDefaultExpression,
	RawServerBase,
	RequestGenericInterface
} from "fastify";
// @ts-ignore
import type fastifyReplyFrom from "@fastify/reply-from";
// @ts-ignore
import type fastifSwagger from "@fastify/swagger";
// @ts-ignore
import type fastifyRateLimit from "@fastify/rate-limit";

interface RemoteOpts {
	host: string,
	remoteBaseUrl?: string,
	gwBaseUrl?: string,
	bodyLimit?: number,
	security?: any,
	hooks?: {
		onRequest?: (request: FastifyRequest, reply: FastifyReply) => any;
		onResponse?: (
			request: FastifyRequest<RequestGenericInterface, RawServerBase>,
			reply: FastifyReply<RawServerBase>,
			res: RawReplyDefaultExpression<RawServerBase>
		) => void;
		onError?: (
			reply: FastifyReply<RawServerBase>,
			error: { error: Error }
		) => void;
	}
}

interface GatewayRoute {
	method?: HTTPMethods | HTTPMethods[],
	schema?: FastifySchema,
	url: string,
	limit?: {
		max?: number | ((req: FastifyRequest) => number),
		keyGenerator?: ((req: FastifyRequest) => string),
		timeWindow?: number
	},
	security?: any,
	preHandler?: preHandlerHookHandler
}

const isObject = (obj: unknown) => {
	return typeof obj === "object" && obj !== null;
};

const unknownFormats = new Set([
	"byte",
	"int32",
	"int64",
	"float",
	"double",
	"binary",
	"password",
]);

const stripResponseFormats = (schema: Record<string, any>, visited = new Set()) => {
	for (const item in schema) {
		if (isObject(schema[item])) {
			if (
				schema[item].format && unknownFormats.has(schema[item].format)
			) {
				schema[item].format = undefined;
			}
			if (!visited.has(item)) {
				visited.add(item);
				stripResponseFormats(schema[item], visited);
			}
		}
	}
};

function proxy(remote:RemoteOpts) {
	return async function proxyRoute(request: FastifyRequest, reply: FastifyReply){
		try {
			let remoteUrl = request.url;
			if (remote.gwBaseUrl) {
				remoteUrl = remoteUrl.replace(remote.gwBaseUrl, "");
			}
			if (remote.remoteBaseUrl) {
				remoteUrl = remote.remoteBaseUrl + remoteUrl;
			}
			const shouldAbortProxy = await remote.hooks.onRequest(request, reply);
			if (!shouldAbortProxy) {
				return reply.from(remote.host + remoteUrl, Object.assign({}, remote.hooks));
			}
		} catch (err) {
			return reply.send(err);
		}
	}
};

const makeRoute = (
	route: GatewayRoute,
	options: RemoteOpts,
	app: FastifyInstance) => {
	const config: any = {};
	const response = route.schema?.response;
	const hasSwagger = app.hasDecorator("swagger");
	if (response) {
		stripResponseFormats(response);
	}
	const bodyLimit = options.bodyLimit ? Number(options.bodyLimit) : 1048576;
	const methods = route.method || ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT", "OPTIONS"];
	const preHandler: preHandlerHookHandler[] = [];
	if(route.security){
		const security: Record<string, any> = {};
		security[route.security[0].name] = route.security[0].parameters;
		if(hasSwagger) {
			route.schema.security = [...route.schema.security || [], security];
		}
		if(route.preHandler) {
			preHandler.push(route.preHandler);
		}
	}
	if(route.limit !== undefined) {
		if(app.hasDecorator("rateLimit")) {
			config.rateLimit = {
				max: function (req: FastifyRequest) {
					if(typeof route.limit.max === "function"){
						return route.limit.max(req);
					}
					return route.limit.max;
				},
				keyGenerator: function (req: FastifyRequest) {
					if(typeof route.limit.keyGenerator === "function"){
						return route.limit.keyGenerator(req);
					}
					return req.ip;
				},
				timeWindow: route.limit.timeWindow || "1 minute"
			};
		}
	}
	let url = route.url;
	if(options.gwBaseUrl){
		url = options.gwBaseUrl + url;
	}
	if(options.remoteBaseUrl){
		url = url.replace(options.remoteBaseUrl,"");
	}
	url = url.replace(/\/+/g, "/");
	options.hooks = options.hooks || {};
	options.hooks.onRequest = options.hooks.onRequest || (async (req: FastifyRequest, reply: FastifyReply) => { });
	options.hooks.onResponse = options.hooks.onResponse || ((req: FastifyRequest, reply: FastifyReply, res: any) => reply.send(res));
	app.route({ method: methods, preHandler, config, schema: route.schema, bodyLimit, url, handler: proxy(options) });
};

export {
	makeRoute
};