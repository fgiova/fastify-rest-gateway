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
import {OpenApiParser} from "./OpenApiParser";
import {makeRoute} from "./makeRoute";

export interface GWService {
	host: string;
	hitLimit?: {
		max: number | ((req: FastifyRequest) => number),
		timeWindow?: string
	},
	authHandler?: preHandlerHookHandler,
	openApiUrl?: string;
	remotePrefix?: string;
	gwPrefix?: string;
	bodyLimit?: number;
	tag?: string;
	hiddenTag?: string;
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
		max: number | ((req: FastifyRequest) => number),
		timeWindow?: string
	};
	gwTag?: string;
	gwHiddenTag?: string;
	undiciAgent?: Agent;
	undiciOpts?: {
		keepAliveMaxTimeout?: number;
		connections?: number;
		rejectUnauthorized?: boolean;
	};
	services: GWService[],
	openApi?: any,
	authHandler?: preHandlerHookHandler
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
			path: `${endpoint}/json`,
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

const resolveRoutes = (routes: any[], fastify: FastifyInstance, gwTag="public-api", gwHiddenTag="private-api") => {
	const gwRoutes: any[] = [];
	const hasSwagger = fastify.hasDecorator("swagger");
	for(const route of routes){
		if(route.schema?.tags.includes(gwTag) || route.schema?.tags.includes(gwHiddenTag)){
			if (hasSwagger) {
				route.schema.tags = route.schema.tags.reduce((acc: string[], value: string) => {
					if(value.toLowerCase() === gwHiddenTag) {
						acc.push("X-HIDDEN");
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
	config: Pick<GWConfig, "gwTag"|"gwHiddenTag"|"defaultLimit"|"authHandler">,
	undiciAgent: Agent,
	fastify: FastifyInstance
) =>  {
	for(const service of services) {
		const openApiRoutes = await readService({
			host: service.host,
			endpoint: service.openApiUrl || "/open-api",
			agent: undiciAgent,
			logger: fastify.log
		});
		if(!openApiRoutes){
			makeRoute({
				url: "/*",
				limit: service.hitLimit || config.defaultLimit,
				authHandler: service.authHandler || config.authHandler
			},
			{
				host: service.host,
				remotePrefix: service.remotePrefix,
				gwPrefix: service.gwPrefix,
				bodyLimit: service.bodyLimit,
				hooks:{
					onError: service.hooks?.onError,
					onRequest: service.hooks?.onRequest,
					onResponse: service.hooks?.onRequest
				}
			}, fastify);
		}
		else {
			for(const route of resolveRoutes(openApiRoutes.routes, fastify, service.tag || config.gwTag, service.hiddenTag || config.gwTag)){

				/* istanbul ignore next */
				const limit = route.limit !== undefined ? route.limit : service.hitLimit || config.defaultLimit;
				makeRoute({
					url: route.url,
					method: route.method as unknown as HTTPMethods,
					schema: route.schema,
					limit,
					security: route.security,
					authHandler: service.authHandler || config.authHandler
				},
				{
					host: service.host,
					remotePrefix: service.remotePrefix,
					gwPrefix: service.gwPrefix,
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

const gateway = async (fastify: FastifyInstance, config: GWConfig, next: any) => {
	const undiciAgent = config.undiciAgent || new Agent({
		keepAliveMaxTimeout: config.undiciOpts?.keepAliveMaxTimeout || 5 * 1000, // 5 seconds
		connections: config.undiciOpts?.connections || 10,
		tls: {
			rejectUnauthorized: config.undiciOpts?.rejectUnauthorized
		}
	});
	await loadGW(config.services,
		{
			gwTag: config.gwTag,
			gwHiddenTag: config.gwHiddenTag,
			authHandler: config.authHandler,
			defaultLimit: config.defaultLimit
		},
		undiciAgent, fastify);

	next();
};

export default fp(gateway, {
	name: "api-gateway",
	dependencies:[
		"@fastify/reply-from"
	],
	fastify: ">=4.x"
});