import fp from "fastify-plugin";
import {
	FastifyInstance,
	FastifyReply,
	FastifyRequest,
	HTTPMethods, preHandlerHookHandler, RawReplyDefaultExpression, RawServerBase,
	RequestGenericInterface
} from "fastify";
import { Agent } from "undici";
import {makeRoute} from "./make-route";
import {servicesToRoutes} from "./schema-fetcher";
import {clearTimeout} from "timers";
import {unlink} from "fs/promises";
// @ts-ignore
import type from "@fastify/restartable";

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
	refreshTimeout?: number;
	routesFile?: string;
	cacheRoutes?: boolean;
	services: GWService[]
}

const loadGW = async (services:GWService[],
	config: Pick<GWConfig, "gwTag"|"gwHiddenTag"|"ignoreHidden"|"defaultLimit"|"routesFile">,
	undiciAgent: Agent,
	fastify: FastifyInstance
) =>  {
	const servicesToLoad =  await servicesToRoutes(services, config, undiciAgent, fastify);
	for(const serviceData of servicesToLoad.services) {
		const {service, routes} = serviceData;
		const limit = service.hitLimit !== undefined ? service.hitLimit : config.defaultLimit;
		if (!routes){
			if(!config.ignoreHidden){
				makeRoute({
						url: "/*",
						limit,
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
			continue;
		}
		for(const route of routes) {
			if(
				(route.schema?.tags?.includes(config.gwHiddenTag) ||
					(route.schema?.tags?.includes("X-HIDDEN"))
				) && config.ignoreHidden) {
				continue;
			}
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
};

const gateway = async (fastify: FastifyInstance & {
	restartableGWMeta?: {
		refreshInterval: NodeJS.Timeout | undefined;
		refreshLock: boolean;
		restarting: boolean;
	};
	closingRestartable?: boolean;
}, config: GWConfig) => {
	const undiciAgent = config.undiciAgent || new Agent({
		keepAliveMaxTimeout: config.undiciOpts?.keepAliveMaxTimeout || 5 * 1000, // 5 seconds
		connections: config.undiciOpts?.connections || 10,
		connect: {
			rejectUnauthorized: config.undiciOpts?.rejectUnauthorized
		}
	});
	let refreshTimeout = fastify.hasDecorator("restart") ? config.refreshTimeout : undefined;
	config.routesFile = !refreshTimeout && config.routesFile ?
		config.routesFile :
		refreshTimeout && config.routesFile ? config.routesFile : refreshTimeout && `./routes-cache.json` || undefined;
	await loadGW(config.services,
		{
			routesFile: config.routesFile,
			gwTag: config.gwTag,
			gwHiddenTag: config.gwHiddenTag,
			defaultLimit: config.defaultLimit,
			ignoreHidden: config.ignoreHidden
		},
		undiciAgent, fastify);
	if(refreshTimeout) {
		fastify.decorate("restartableGWMeta", {
			refreshInterval: undefined,
			refreshLock: false,
			restarting: false
		});

		function watcher () {
			return setTimeout(async () => {
				fastify.log.debug(fastify.restartableGWMeta, "refreshing routes");
				if(fastify.restartableGWMeta.refreshLock || fastify.restartableGWMeta.restarting) {
					return;
				}
				fastify.restartableGWMeta.refreshLock = true;
				fastify.log.debug("read routes from remote hosts");
				const servicesToLoad =  await servicesToRoutes(config.services, config, undiciAgent, fastify, true);
				fastify.log.debug({
					routesFile: servicesToLoad
				}, "routes to load");
				if(servicesToLoad.reload) {
					fastify.restartableGWMeta.restarting = true;
					try {
						fastify.log.debug("restarting fastify");
						await fastify.restart();
						return;
					}
					catch (e) /* istanbul ignore next */{
						fastify.restartableGWMeta.refreshLock = false;
						fastify.restartableGWMeta.restarting = false;
						fastify.log.error(e);
					}
				}
				else{
					fastify.restartableGWMeta.refreshLock = false;
				}
				fastify.restartableGWMeta.refreshInterval = watcher();
				return fastify.restartableGWMeta.refreshInterval;
			}, refreshTimeout);
		}

		fastify.addHook("onReady" as any, async function reloadGW() {
			fastify.log.debug("starting refreshable");
			fastify.restartableGWMeta.refreshInterval = watcher();
		});
		fastify.addHook("onClose", async function closeGW() {
			fastify.restartableGWMeta.restarting = true;
			if(fastify.closingRestartable) {
				clearTimeout(fastify.restartableGWMeta.refreshInterval);
				fastify.log.debug(`deleting routes file ${config.routesFile}`);
				await unlink(config.routesFile);
			}
			return;
		});
	}
};

export default fp(gateway, {
	name: "rest-gateway",
	dependencies:[
		"@fastify/reply-from"
	],
	fastify: ">=4.x"
});