import fp from "fastify-plugin";
import {
	FastifyInstance,
	FastifyLoggerInstance,
	FastifyReply,
	FastifyRequest,
	HTTPMethods, preHandlerHookHandler, RawReplyDefaultExpression, RawServerBase,
	RequestGenericInterface
} from "fastify";
import { Agent } from "undici";
import {Readable} from "stream";
import sJSON from "secure-json-parse";
import {OpenApiParser} from "./open-api-parser";
import {makeRoute} from "./make-route";

export interface GWService {
	host: string;
	hitLimit?: {
		max?: number | ((req: FastifyRequest) => number),
		keyGenerator?: ((req: FastifyRequest) => string),
		timeWindow?: number
	},

	openApiUrl?: string;
	remoteBaseUrl?: string;
	gwBaseUrl?: string;
	bodyLimit?: number;
	tag?: string;
	hiddenTag?: string;
	preHandler?: preHandlerHookHandler,
	hooks?:{
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

export interface GWConfig {
	defaultLimit?: {
		max?: number | ((req: FastifyRequest) => number),
		keyGenerator?: ((req: FastifyRequest) => string),
		timeWindow?: number
	};
	gwTag?: string;
	gwHiddenTag?: string;
	ignoreHidden?: boolean;
	undiciAgent?: Agent;
	undiciOpts?: {
		keepAliveMaxTimeout?: number;
		connections?: number;
		rejectUnauthorized?: boolean;
	};
	services: GWService[]
}

const readService = async (options: {
	host: string;
	endpoint: string;
	agent: Agent;
	logger: FastifyLoggerInstance
}) => {
	const { agent, host, endpoint, logger} = options;
	let response, json;
	try {
		response = await agent.request({
			origin: `${host}`,
			method: "GET",
			path: `${endpoint}`,
			headers: {
				"content-type": "application/json"
			}
		});
	}
	catch (e) {
		logger.warn(e);
		return null;
	}
	const {statusCode, body: stream} = response as {statusCode:number, body: Readable};
	if(statusCode !== 200) return null;
	try {
		stream.setEncoding("utf8");
		let data = "";
		for await (const chunk of stream) {
			data += chunk;
		}
		json = sJSON.parse(data.toString());
	} catch (e) {
		logger.warn(e);
		return null;
	}
	const parser = new OpenApiParser();
	return parser.parse(json);
};

const resolveRoutes = (routes: any[], fastify: FastifyInstance,
                       gwTag="public-api",
                       hiddenTag="private-api",
                       gwHiddenTag = "X-HIDDEN") => {
	const gwRoutes: any[] = [];
	const hasSwagger = fastify.hasDecorator("swagger");
	for(const route of routes){
		if(route.schema?.tags?.includes(gwTag) || route.schema?.tags?.includes(hiddenTag)){
			if (hasSwagger) {
				route.schema.tags = route.schema.tags.reduce((acc: string[], value: string) => {
					if(value.toLowerCase() === hiddenTag && hiddenTag !== gwHiddenTag) {
						acc.push(gwHiddenTag);
						return acc;
					}
					if(value.toLowerCase() === gwTag) return acc;
					acc.push(value);
					return acc;
				}, []);
			}
			else {
				delete route.schema.tags
			}
			gwRoutes.push(route);
		}
	}
	return gwRoutes;
};

const loadGW = async (services:GWService[],
	config: Pick<GWConfig, "gwTag"|"gwHiddenTag"|"ignoreHidden"|"defaultLimit">,
	undiciAgent: Agent,
	fastify: FastifyInstance
) =>  {
	for(const service of services) {
		const openApiRoutes = await readService({
			host: service.host,
			endpoint: service.openApiUrl || "/open-api/json",
			agent: undiciAgent,
			logger: fastify.log
		});
		if(!openApiRoutes && !config.ignoreHidden){
			makeRoute({
				url: "/*",
				limit: service.hitLimit || config.defaultLimit,
				preHandler: service.preHandler
			},
			{
				host: service.host,
				remoteBaseUrl: service.remoteBaseUrl,
				gwBaseUrl: service.gwBaseUrl,
				bodyLimit: service.bodyLimit,
				hooks:{
					onError: service.hooks?.onError,
					onRequest: service.hooks?.onRequest,
					onResponse: service.hooks?.onRequest
				}
			}, fastify);
		}
		else if(openApiRoutes){
			for(const route of resolveRoutes(openApiRoutes.routes, fastify, service.tag || config.gwTag, service.hiddenTag, config.gwHiddenTag)){
				if(
					(route.schema?.tags?.includes(config.gwHiddenTag) ||
					(route.schema?.tags?.includes("X-HIDDEN"))
				) && config.ignoreHidden) {
					continue;
				}
				const limit = service.hitLimit !== undefined ? service.hitLimit : config.defaultLimit;
				makeRoute({
					url: route.url,
					method: route.method as unknown as HTTPMethods,
					schema: route.schema,
					limit,
					security: route.security,
					preHandler: service.preHandler
				},
				{
					host: service.host,
					remoteBaseUrl: service.remoteBaseUrl,
					gwBaseUrl: service.gwBaseUrl,
					bodyLimit: service.bodyLimit,
					hooks:{
						onError: service.hooks?.onError,
						onRequest: service.hooks?.onRequest,
						onResponse: service.hooks?.onRequest
					}
				}, fastify);
			}
		}
	}
};

const gateway = async (fastify: FastifyInstance, config: GWConfig) => {
	const undiciAgent = config.undiciAgent || new Agent({
		keepAliveMaxTimeout: config.undiciOpts?.keepAliveMaxTimeout || 5 * 1000, // 5 seconds
		connections: config.undiciOpts?.connections || 10,
		connect: {
			rejectUnauthorized: config.undiciOpts?.rejectUnauthorized
		}
	});
	await loadGW(config.services,
		{
			gwTag: config.gwTag,
			gwHiddenTag: config.gwHiddenTag,
			defaultLimit: config.defaultLimit,
			ignoreHidden: config.ignoreHidden
		},
		undiciAgent, fastify);
};

export default fp(gateway, {
	name: "rest-gateway",
	dependencies:[
		"@fastify/reply-from"
	],
	fastify: ">=4.x"
});