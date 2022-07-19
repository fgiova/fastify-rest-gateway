import {
	FastifyInstance,
	FastifyReply,
	FastifyRequest, FastifySchema, HTTPMethods, preHandlerHookHandler, RawReplyDefaultExpression,
	RawServerBase,
	RequestGenericInterface
} from "fastify";

interface RemoteOpts {
	host: string,
	remotePrefix?: string,
	gwPrefix?: string,
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

const proxy = (remote:RemoteOpts) => async (request: FastifyRequest, reply: FastifyReply) => {
	try {
		let remoteUrl = request.url;
		if(remote.gwPrefix){
			remoteUrl = remoteUrl.replace(remote.gwPrefix,"");
		}
		if(remote.remotePrefix){
			remoteUrl = remote.remotePrefix + remoteUrl;
		}
		const shouldAbortProxy = await remote.hooks.onRequest(request, reply);
		if (!shouldAbortProxy) {
			reply.from(remote.host + remoteUrl, Object.assign({}, remote.hooks));
		}
	} catch (err) {
		reply.send(err);
	}
};

interface GatewayRoute {
	method?: HTTPMethods | HTTPMethods[],
	schema?: FastifySchema,
	url: string,
	limit?: {
		max: number | ((req: FastifyRequest) => number),
		timeWindow?: string
	},
	security?: any,
	authHandler?: preHandlerHookHandler
}

const makeRoute = (
	route: GatewayRoute,
	options: RemoteOpts,
	fastify: FastifyInstance) => {
	const config: any = {};
	const response = route.schema?.response;
	const hasSwagger = fastify.hasDecorator("swagger");
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
		if(route.authHandler) {
			preHandler.push(route.authHandler);
		}
	}
	if(route.limit !== undefined) {
		if(fastify.hasDecorator("rateLimit")) {
			config.rateLimit ={
				max: (req: FastifyRequest) => {
					if(typeof route.limit.max === "function"){
						return route.limit.max(req);
					}
					else {
						return route.limit.max;
					}
				},
				timeWindow: route.limit.timeWindow || "1 minute"
			};
		}
	}
	let url = route.url;
	if(options.gwPrefix){
		url = options.gwPrefix + url;
	}
	if(options.remotePrefix){
		url = url.replace(options.remotePrefix,"");
	}
	options.hooks = options.hooks || {};
	options.hooks.onRequest = options.hooks.onRequest || (async (req: FastifyRequest, reply: FastifyReply) => { });
	options.hooks.onResponse = options.hooks.onResponse || ((req: FastifyRequest, reply: FastifyReply, res: any) => reply.send(res));
	fastify.route({ method: methods, preHandler, config, schema: route.schema, bodyLimit, url, handler: proxy(options) });
};

export {
	makeRoute
};