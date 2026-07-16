export type HttpMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';
export type FlagValues = Record<string, boolean | string | string[] | undefined>;

export interface CliError {
  code: string;
  details?: unknown;
  message: string;
  status?: number;
}

export interface OperationParameter {
  description?: string;
  enum?: readonly unknown[];
  in: string;
  itemType?: string;
  maximum?: number;
  minimum?: number;
  name: string;
  required: boolean;
  type: string;
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
  requestBodyRequired: boolean;
  summary: string;
  tags: readonly string[];
}
