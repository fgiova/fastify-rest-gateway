//Fork and rework of the ParserV3 from the https://github.com/seriousme/fastify-openapi-glue

const HttpOperations = new Set([
	"delete",
	"get",
	"head",
	"patch",
	"post",
	"put",
	"options",
]);

const explodingTypes = new Set([
	"object",
	"array"
]);

interface DataSchema {
	in: "path" | "query" | "header"
	name: string;
	explode?:boolean;
	required?: boolean;
	description?: string;
	schema: Record<string, any>
}

interface ParamsData {
	type: "object";
	properties: Record<string, any>;
	required?: string[];
}

export class OpenApiParser {
	private config: Record<string, any>;
	private spec: any = {};

	constructor() {
		this.config = {generic: {}, routes: [], contentTypes: new Set()};
	}

	makeOperationId(operation: string, path: string) {
		// make a nice camelCase operationID
		// e.g. get /user/{name}  becomes getUserByName
		const firstUpper = (str: string) => str.substr(0, 1).toUpperCase() + str.substr(1);
		const by = (matched: string, p1: string) => "By" + firstUpper(p1);
		const parts = path.split("/").slice(1);
		parts.unshift(operation);
		const opId = parts
			.map((item, i) => (i > 0 ? firstUpper(item) : item))
			.join("")
			.replace(/{(\w+)}/g, by)
			.replace(/[^a-z]/gi, "");
		return opId;
	}

	makeURL(path: string) {
		// fastify wants 'path/:param' instead of openapis 'path/{param}'
		return path.replace(/{(\w+)}/g, ":$1");
	}

	copyProps(source: Record<string, any>, target: Record<string, any>, list: string[], copyXprops = false) {
		Object.keys(source).forEach((item) => {
			if (list.includes(item) || (copyXprops && item.startsWith("x-"))) {
				target[item] = source[item];
			}
		});
	}

	parseSecurity(schemes?: Record<string, any>[]) {
		return schemes
			? schemes.map((item) => {
				const name = Object.keys(item)[0];
				return {
					name,
					parameters: item[name],
				};
			})
			: undefined;
		// return schemes ? schemes.map((item) => Object.keys(item)[0]) : undefined;
	}

	parseQueryString(data: DataSchema[]) {
		if ((data.length === 1)
			&& (data[0].explode !== false)
			&& (typeof data[0].schema === "object")
			&& explodingTypes.has(data[0].schema.type)) {
			return data[0].schema;
		}
		return this.parseParams(data);
	}

	parseParams(data: DataSchema[]) {
		const params: ParamsData = {
			type: "object",
			properties: {},
		};
		const required: string[] = [];
		data.forEach((item: { name: string, schema: Record<string, string>, required?: boolean }) => {
			params.properties[item.name] = item.schema;
			this.copyProps(item, params.properties[item.name], ["description"]);
			// ajv wants "required" to be an array, which seems to be too strict
			// see https://github.com/json-schema/json-schema/wiki/Properties-and-required
			if (item.required) {
				required.push(item.name);
			}
		});
		if (required.length > 0) {
			params.required = required;
		}
		return params;
	}

	parseParameters(schema: any, data: DataSchema[]) {
		const params: DataSchema[] = [];
		const querystring: DataSchema[] = [];
		const headers: DataSchema[] = [];
		data.forEach((item: DataSchema) => {
			switch (item.in) {
			case "path":
				params.push(item);
				break;
			case "query":
				querystring.push(item);
				break;
			case "header":
				headers.push(item);
				break;
			}
		});
		if (params.length > 0) schema.params = this.parseParams(params);
		if (querystring.length > 0)
			schema.querystring = this.parseQueryString(querystring);
		if (headers.length > 0) schema.headers = this.parseParams(headers);
	}

	parseBody(data: {content?:Record<string, { schema: any }>}) {
		if (data && data.content) {
			const mimeTypes = Object.keys(data.content);
			if (mimeTypes.length === 0){
				return undefined;
			}
			mimeTypes.forEach(mimeType => this.config.contentTypes.add(mimeType));
			// fastify only supports one mimeType per path, pick the last
			return data.content[mimeTypes.pop()].schema;
		}
		return undefined;
	}

	parseResponses(responses: Record<string, any>) {
		const result: Record<string, any> = {};
		for (const httpCode in responses) {
			const body = this.parseBody(responses[httpCode]);
			if (body !== undefined) {
				result[httpCode] = body;
			}
		}
		return result;
	}

	makeSchema(genericSchema: Record<string, any>, data:  any) {
		const schema = Object.assign({}, genericSchema);
		const copyItems = ["tags", "summary", "description", "operationId"];
		this.copyProps(data, schema, copyItems, true);
		if (data.parameters) this.parseParameters(schema, data.parameters);
		const body = this.parseBody(data.requestBody);
		if (body) {
			schema.body = body;
		}
		const response = this.parseResponses(data.responses);
		if (Object.keys(response).length > 0) {
			schema.response = response;
		}
		return schema;
	}

	processOperation(path: string, operation: string, operationSpec: any, genericSchema: Record<string, any>) {
		const route = {
			method: operation.toUpperCase(),
			url: this.makeURL(path),
			schema: this.makeSchema(genericSchema, operationSpec),
			operationId:
				operationSpec.operationId || this.makeOperationId(operation, path),
			openapiSource: operationSpec,
			security: this.parseSecurity(
				operationSpec.security || this.spec.security
			),
		};
		this.config.routes.push(route);
	}

	processPaths(paths: Record<string, any>) {
		const copyItems = ["summary", "description"];
		for (const path in paths) {
			const genericSchema = {};
			const pathSpec = paths[path];

			this.copyProps(pathSpec, genericSchema, copyItems, true);
			/* istanbul ignore next */
			if (typeof pathSpec.parameters === "object") {
				this.parseParameters(genericSchema, pathSpec.parameters);
			}
			for (const pathItem in pathSpec) {
				if (HttpOperations.has(pathItem)) {
					this.processOperation(
						path,
						pathItem,
						pathSpec[pathItem],
						genericSchema
					);
				}
			}
		}
	}

	parse(spec?: Record<string, any>) {
		this.spec = spec;

		for (const item in spec) {
			switch (item) {
			case "paths":
				this.processPaths(spec.paths);
				break;
			case "components":
				/* istanbul ignore else */
				if (spec.components.securitySchemes) {
					this.config.securitySchemes = spec.components.securitySchemes;
				} // the missing break is on purpose !
			default:
				this.config.generic[item] = spec[item];
			}
		}
		return this.config;
	}
}