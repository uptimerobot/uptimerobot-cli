import { describe, expect, it } from 'vitest';
import { buildRequestBody } from '../src/lib/request.js';
import type { OperationDefinition } from '../src/lib/types.js';

const operation: OperationDefinition = {
  commandId: 'monitors:create:http',
  contentTypes: ['application/json'],
  defaultApiUrl: 'https://api.example.test/v3',
  destructive: false,
  method: 'POST',
  operationId: 'MonitorsController_create',
  parameters: [],
  path: '/monitors',
  requestBodyDefaults: { type: 'HTTP' },
  requestBodyFields: [
    {
      flag: 'assigned-alert-contacts',
      items: {
        properties: {
          alertContactId: { example: 12345, type: 'number' },
          recurrence: { minimum: 0, type: 'number' },
          threshold: { minimum: 0, type: 'number' },
        },
        requiredProperties: ['alertContactId', 'threshold', 'recurrence'],
        type: 'object',
      },
      path: 'assignedAlertContacts',
      required: false,
      type: 'array',
    },
  ],
  requestBodyRequired: true,
  summary: 'Create an HTTP monitor',
  tags: ['Monitors'],
};

describe('request bodies', () => {
  it('accepts both bare IDs and full JSON for assigned alert contacts', async () => {
    const headers = new Headers();
    const body = await buildRequestBody(
      operation,
      {
        'assigned-alert-contacts': [
          '7448212',
          '{"alertContactId":42,"threshold":5,"recurrence":30}',
        ],
      },
      headers,
    );

    expect(JSON.parse(String(body))).toEqual({
      assignedAlertContacts: [
        { alertContactId: 7448212, recurrence: 0, threshold: 0 },
        { alertContactId: 42, recurrence: 30, threshold: 5 },
      ],
      type: 'HTTP',
    });
  });

  it('reports the indexed path when an array item is invalid', async () => {
    const headers = new Headers();
    const request = buildRequestBody(
      operation,
      { 'assigned-alert-contacts': ['{"threshold":0,"recurrence":0}'] },
      headers,
    );

    await expect(request).rejects.toEqual(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        expected: 'required property alertContactId',
        path: 'assignedAlertContacts[0].alertContactId',
      }),
    );
  });

  it('uses GET for Keyword monitors and rejects HEAD', async () => {
    const keywordOperation: OperationDefinition = {
      ...operation,
      commandId: 'monitors:create:keyword',
      requestBodyDefaults: { type: 'KEYWORD' },
      requestBodyFields: [
        {
          enum: ['HEAD', 'GET', 'POST'],
          flag: 'method',
          path: 'httpMethodType',
          required: false,
          type: 'string',
        },
      ],
    };

    const defaultBody = await buildRequestBody(keywordOperation, {}, new Headers());
    const explicitHead = buildRequestBody(
      keywordOperation,
      { body: '{"httpMethodType":"HEAD"}' },
      new Headers(),
    );

    expect(JSON.parse(String(defaultBody))).toMatchObject({
      httpMethodType: 'GET',
      type: 'KEYWORD',
    });
    await expect(explicitHead).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      expected: 'a method other than HEAD for Keyword monitors',
      path: 'httpMethodType',
    });
  });

  it('does not send OpenAPI presentation defaults when a flag is omitted', async () => {
    const documentedDefault: OperationDefinition = {
      ...operation,
      requestBodyFields: [
        {
          default: true,
          flag: 'enabled',
          path: 'enabled',
          required: false,
          type: 'boolean',
        },
      ],
    };

    const body = await buildRequestBody(documentedDefault, {}, new Headers());

    expect(JSON.parse(String(body))).toEqual({ type: 'HTTP' });
  });

  it('rejects unknown properties in closed OpenAPI objects', async () => {
    const closedObject: OperationDefinition = {
      ...operation,
      requestBodyFields: [
        {
          flag: 'region-thresholds',
          path: 'regionData.THRESHOLD',
          properties: { eu: { type: 'number' }, na: { type: 'number' } },
          additionalProperties: false,
          required: false,
          type: 'object',
        },
      ],
    };

    const request = buildRequestBody(
      closedObject,
      { 'region-thresholds': '{"euu":5000}' },
      new Headers(),
    );

    await expect(request).rejects.toMatchObject({
      code: 'INVALID_INPUT',
      expected: 'a documented property',
      path: 'regionData.THRESHOLD.euu',
    });
  });

  it('measures string limits in Unicode code points', async () => {
    const unicodeOperation: OperationDefinition = {
      ...operation,
      requestBodyFields: [
        {
          flag: 'name',
          maxLength: 1,
          minLength: 1,
          path: 'friendlyName',
          required: true,
          type: 'string',
        },
      ],
    };

    const body = await buildRequestBody(unicodeOperation, { name: '😀' }, new Headers());

    expect(JSON.parse(String(body))).toMatchObject({ friendlyName: '😀' });
  });
});
