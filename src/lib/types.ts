export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type FlagValues = Record<string, boolean | string | string[] | undefined>;

export interface CliError {
  code: string;
  command?: string;
  details?: unknown;
  expected?: string;
  message: string;
  path?: string;
  status?: number;
  suggestions?: readonly string[];
}

export interface OperationParameter {
  default?: unknown;
  description?: string;
  enum?: readonly unknown[];
  example?: unknown;
  in: string;
  itemType?: string;
  maximum?: number;
  minimum?: number;
  name: string;
  required: boolean;
  type: string;
}

export type OperationBodyFieldType =
  | 'array'
  | 'boolean'
  | 'integer'
  | 'json'
  | 'number'
  | 'object'
  | 'string';

export interface OperationValueSchema {
  additionalProperties?: boolean | OperationValueSchema;
  default?: unknown;
  deprecated?: boolean;
  description?: string;
  enum?: readonly unknown[];
  example?: unknown;
  items?: OperationValueSchema;
  maximum?: number;
  maxItems?: number;
  maxLength?: number;
  minimum?: number;
  minItems?: number;
  minLength?: number;
  nullable?: boolean;
  properties?: Readonly<Record<string, OperationValueSchema>>;
  requiredProperties?: readonly string[];
  type: OperationBodyFieldType;
}

export interface OperationBodyField extends OperationValueSchema {
  aliases?: readonly string[];
  deprecated?: boolean;
  flag: string;
  hidden?: boolean;
  path: string;
  required: boolean;
  requiredWhenParentPresent?: boolean;
}

export interface OperationExample {
  body: unknown;
  name: string;
  summary?: string;
}

export interface OperationDefinition {
  commandId: string;
  contentTypes: readonly string[];
  defaultApiUrl: string;
  description?: string;
  destructive: boolean;
  method: HttpMethod;
  operationId: string;
  parameters: readonly OperationParameter[];
  path: string;
  requestBodyDefaults?: Readonly<Record<string, unknown>>;
  requestBodyExamples?: readonly OperationExample[];
  requestBodyFields?: readonly OperationBodyField[];
  requestBodyRequired: boolean;
  summary: string;
  tags: readonly string[];
}
