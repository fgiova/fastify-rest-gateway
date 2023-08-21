// Fork and rework of the ParserV3 from the https://github.com/seriousme/fastify-openapi-glue

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
		// make a nice camelCase operationID in case it is not defined in the spec
		// e.g. get /user/{name}  becomes getUserByName
		const firstUpper = (str: string) => str.substring(0, 1).toUpperCase() + str.substring(1);
		const by = (matched: string, p1: string) => "By" + firstUpper(p1);
		const parts = path.split("/").slice(1);
		parts.unshift(operation);
		return  parts
			.map((item, i) => (i > 0 ? firstUpper(item) : item))
			.join("")
			.replace(/{(\w+)}/g, by)
			.replace(/[^a-z]/gi, "");
	}

	makeURL(path: string) {
		// fastify route parameters must be 'path/:param' instead of openapi 'path/{param}'
		return path.replace(/{(\w+)}/g, ":$1");
	}

	copyProps(source: Record<string, any>, target: Record<string, any>, list: string[], copyXprops = false) {
		for(const item in source){
			// openapi 3.1.0 has a "example" property, but ajv wants "examples"
			if (item === "example" && list.includes(item) ){
				target.examples = [source[item]];
				continue;
			}
			if (list.includes(item) || (copyXprops && item.startsWith("x-"))) {
				target[item] = source[item];
			}
		}
	}

	parseSecurity(schemas?: Record<string, any>[]) {
		return schemas
			? schemas.map((item) => {
				const name = Object.keys(item)[0];
				return {
					name,
					parameters: item[name],
				};
			})
			: undefined;
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
		for (const item of data) {
			params.properties[item.name] = item.schema;
			this.copyProps(item, params.properties[item.name], ["description"]);
			// ajv wants "required" to be an array, which seems to be too strict
			// see https://github.com/json-schema/json-schema/wiki/Properties-and-required
			if (item.required) {
				required.push(item.name);
			}
		}
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
		if (params.length) schema.params = this.parseParams(params);
		if (querystring.length)
			schema.querystring = this.parseQueryString(querystring);
		if (headers.length) schema.headers = this.parseParams(headers);
	}

	parseExample(schema: Record<string, any>,key: string) {
		const value = schema.properties[key];
		const simpleArray = (value.items && !["array", "object"].includes(value.items.type));
		/* istanbul ignore else */
		if(value){
			if(simpleArray) {
				/* istanbul ignore else */
				if (value.items.example){
					schema.properties[key].items.examples = [value.items.example];
					delete schema.properties[key].items.example;
				}
				else if  (value.items.examples && !Array.isArray(value.items.examples)) {
					schema.properties[key].items.examples = Object.keys(value.items.examples).map((k) => value.items.examples[k]);
				}
			}
			else {
				/* istanbul ignore else */
				if (value.example) {
					schema.properties[key].examples = [value.example];
					delete schema.properties[key].example;
				}
				else if (value.examples && !Array.isArray(value.examples)) {
					schema.properties[key].examples = Object.keys(value.examples).map((k) => value.examples[k]);
				}
			}

		}
	}

	// openapi 3.1.0 "examples" property is an object, but ajv wants an array
	changeExampleSyntax(schema: Record<string, any>) {
		/* istanbul ignore else */
		if (schema.properties) {
			for (const [key, value] of Object.entries(schema.properties as Record<string, any>)) {
				if (value.type === "object") {
					this.changeExampleSyntax(value);
				}
				else if (value.type === "array") {
					if(["array", "object"].includes(value.items.type)){
						this.changeExampleSyntax(value.items);
					}
					else {
						this.parseExample(schema,key);
					}
				}
				else {
					this.parseExample(schema,key);
				}
			}
		}
	}


	parseBody(data: {content?:Record<string, { schema: any }>}) {
		if (data && data.content) {
			const mimeTypes = Object.keys(data.content);
			if (mimeTypes.length === 0){
				return undefined;
			}
			for(const mimeType of mimeTypes){
				this.config.contentTypes.add(mimeType);
			}
			// fastify only supports one mimeType per path, pick the last
			const schema = data.content[mimeTypes.pop()].schema;
			this.changeExampleSyntax(schema);
			return schema;
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
		const schema = {...genericSchema};
		const copyItems = ["tags", "summary", "description", "operationId"];
		this.copyProps(data, schema, copyItems, true);
		if (data.parameters) this.parseParameters(schema, data.parameters);
		const body = this.parseBody(data.requestBody);
		if (body) {
			schema.body = body;
		}
		const response = this.parseResponses(data.responses);
		if (Object.keys(response).length) {
			schema.response = response;
		}
		return schema;
	}

	processOperation(path: string, operation: string, operationSpec: any, genericSchema: Record<string, any>) {
		const route = {
			method: operation.toUpperCase(),
			url: this.makeURL(path),
			schema: this.makeSchema(genericSchema, operationSpec),
			operationId: operationSpec.operationId || this.makeOperationId(operation, path),
			openapiSource: operationSpec,
			security: this.parseSecurity( operationSpec.security || this.spec.security ),
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
					this.processOperation(path, pathItem, pathSpec[pathItem], genericSchema);
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
				if (spec.components.securitySchemes) {
					this.config.securitySchemes = spec.components.securitySchemes;
				}
				else {
					this.config.generic[item] = spec[item];
				}
				break;
			default:
				this.config.generic[item] = spec[item];
			}
		}
		return this.config;
	}
}