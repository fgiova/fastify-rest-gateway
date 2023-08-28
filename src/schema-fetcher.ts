import {Agent} from "undici";
import {FastifyBaseLogger, FastifyInstance} from "fastify";
import {Readable} from "stream";
import { createHash } from "crypto";
import sJSON from "secure-json-parse";
import pMap from "p-map";
import {OpenApiParser} from "./open-api-parser";
import {GWConfig, GWService} from "./index";
import {readFile, writeFile, stat} from "fs/promises";

const routesChecksum= new Map<string, string>();
async function fetchRemoteSchema ( host: string, endpoint: string, agent: Agent, logger: FastifyBaseLogger){
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

function resolveRoutes (routes: any[], fastify: FastifyInstance,
                       gwTag="public-api",
                       hiddenTag="private-api",
                       gwHiddenTag = "X-HIDDEN"){
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
				delete route.schema.tags;
			}
			gwRoutes.push(route);
		}
	}
	return gwRoutes;
}

async function servicesToRoutes(services: GWService[], config: Pick<GWConfig, "gwTag"|"gwHiddenTag"|"ignoreHidden"|"defaultLimit"| "routesFile">, agent: Agent, fastify: FastifyInstance, reload=false) {
	if(!reload && config.routesFile) {
		try {
			/* istanbul ignore else */
			if((await stat(config.routesFile)).isFile) {
				const routesJson = await readFile(config.routesFile, "utf8");
				const services = JSON.parse(routesJson);
				for (const serviceData of services) {
					const newChecksum = createHash("md5").update(JSON.stringify(serviceData.routes)).digest("hex");
					routesChecksum.set(serviceData.service.host, newChecksum);
				}
				fastify.log.debug(`Loaded routes from ${config.routesFile}`);
				fastify.log.debug({
					checksums: Array.from(routesChecksum)
				}, "routesChecksum");
				return {
					reload: false,
					services,
				}
			}
		}
		catch (e) {
			fastify.log.warn(`Error reading routes file: ${config.routesFile}`);
		}
	}
	const servicesData = [];
	let reloadServices = false;
	const servicesAndSchemas = await pMap(services, async (service) => {
		const {host, openApiUrl} = service;
		const endpoint = openApiUrl || "/open-api/json";
		const schema = await fetchRemoteSchema(host, endpoint, agent, fastify.log);
		return {
			service,
			schema
		}
	});
	for (const serviceAndSchema of servicesAndSchemas){
		const {service, schema} = serviceAndSchema;
		const routes = schema ? resolveRoutes(schema.routes, fastify, service.tag || config.gwTag, service.hiddenTag, config.gwHiddenTag) : null;
		const newChecksum = createHash("md5").update(JSON.stringify(routes)).digest("hex");
		if(reload && !reloadServices) {
			const oldChecksum = routesChecksum.get(service.host);
			if(oldChecksum !== newChecksum) reloadServices = true;
		}
		routesChecksum.set(service.host, newChecksum);
		servicesData.push({
			service,
			routes,
		});
	}
	if(config.routesFile) {
		await writeFile(config.routesFile, JSON.stringify(servicesData, null, 2));
	}
	return {
		reload: reloadServices,
		services: servicesData,
	}
}

export {
	resolveRoutes,
	fetchRemoteSchema,
	servicesToRoutes,
}