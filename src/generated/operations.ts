import type { OperationDefinition } from '../lib/types.js';

export const operations = {
  "alert-contacts:create": {
    "commandId": "alert-contacts:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a personal alert contact. Email and push (iOS/Android) are supported; Pro SMS and voice require phone verification and are not creatable here.",
    "destructive": false,
    "method": "POST",
    "operationId": "AlertContactsController_create",
    "parameters": [],
    "path": "/alert-contacts",
    "requestBodyRequired": true,
    "summary": "Create a personal alert contact",
    "tags": [
      "Alert Contacts"
    ],
    "requestBodyFields": [
      {
        "flag": "type",
        "path": "type",
        "required": true,
        "description": "Personal alert-contact type. Email and mobile push for iOS or Android are creatable here; Pro SMS and voice require phone verification. Use MobileAppIOS or MobileAppAndroid for mobile push. DEPRECATED: MobileAppOld (use MobileAppIOS) and MobileApp (use MobileAppAndroid) are accepted through October 10, 2026 and will be rejected after that date.",
        "enum": [
          "Email",
          "ProSms",
          "Voice",
          "MobileAppIOS",
          "MobileAppAndroid",
          "MobileAppOld",
          "MobileApp"
        ],
        "type": "string"
      },
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": false,
        "description": "Display name of the alert contact",
        "type": "string"
      },
      {
        "flag": "enable-notifications-for",
        "path": "enableNotificationsFor",
        "required": false,
        "enum": [
          0,
          1,
          2,
          3
        ],
        "type": "number"
      },
      {
        "flag": "value",
        "path": "value",
        "required": false,
        "description": "Email address (required for Email contacts)",
        "type": "string"
      },
      {
        "flag": "device-name",
        "path": "deviceName",
        "required": false,
        "description": "Device name (push)",
        "type": "string"
      },
      {
        "flag": "one-signal-subscription-id",
        "path": "oneSignalSubscriptionId",
        "required": false,
        "description": "OneSignal subscription ID (push)",
        "type": "string"
      },
      {
        "flag": "one-signal-user-id",
        "path": "oneSignalUserId",
        "required": false,
        "description": "OneSignal user ID (push)",
        "type": "string"
      },
      {
        "flag": "device-fingerprint",
        "path": "deviceFingerprint",
        "required": false,
        "description": "Device fingerprint (push)",
        "type": "string"
      },
      {
        "flag": "push-token",
        "path": "pushToken",
        "required": false,
        "description": "Push notification token (push)",
        "type": "string"
      },
      {
        "flag": "platform",
        "path": "platform",
        "required": false,
        "description": "Device platform (push)",
        "enum": [
          "ios",
          "android"
        ],
        "type": "string"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "properties": {
          "android_push_up_channel": {
            "type": "string"
          },
          "android_push_down_channel": {
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-android-push-up-channel",
        "path": "config.android_push_up_channel",
        "required": false,
        "type": "string"
      },
      {
        "flag": "config-android-push-down-channel",
        "path": "config.android_push_down_channel",
        "required": false,
        "type": "string"
      }
    ]
  },
  "alert-contacts:delete": {
    "commandId": "alert-contacts:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete a personal alert contact",
    "destructive": true,
    "method": "DELETE",
    "operationId": "AlertContactsController_delete",
    "parameters": [
      {
        "description": "ID of the personal alert contact",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/alert-contacts/{id}",
    "requestBodyRequired": false,
    "summary": "Delete a personal alert contact",
    "tags": [
      "Alert Contacts"
    ]
  },
  "alert-contacts:get": {
    "commandId": "alert-contacts:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get a personal alert contact details by ID",
    "destructive": false,
    "method": "GET",
    "operationId": "AlertContactsController_get",
    "parameters": [
      {
        "description": "ID of the personal alert contact",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/alert-contacts/{id}",
    "requestBodyRequired": false,
    "summary": "Get a personal alert contact by ID",
    "tags": [
      "Alert Contacts"
    ]
  },
  "alert-contacts:list": {
    "commandId": "alert-contacts:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List the personal alert contacts (email, Pro SMS, voice, iOS/Android push) owned by the authenticated user. Integrations are managed separately through /v3/integrations.",
    "destructive": false,
    "method": "GET",
    "operationId": "AlertContactsController_list",
    "parameters": [
      {
        "description": "Maximum number of alert contacts to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Cursor to paginate through the personal alert contacts",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/alert-contacts",
    "requestBodyRequired": false,
    "summary": "List personal alert contacts",
    "tags": [
      "Alert Contacts"
    ]
  },
  "alert-contacts:update": {
    "commandId": "alert-contacts:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update a personal alert contact",
    "destructive": false,
    "method": "PATCH",
    "operationId": "AlertContactsController_update",
    "parameters": [
      {
        "description": "ID of the personal alert contact",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/alert-contacts/{id}",
    "requestBodyRequired": true,
    "summary": "Update a personal alert contact",
    "tags": [
      "Alert Contacts"
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": false,
        "description": "Display name of the personal alert contact",
        "example": "My work email",
        "type": "string"
      },
      {
        "flag": "enable-notifications-for",
        "path": "enableNotificationsFor",
        "required": false,
        "description": "Which monitor events this contact is notified for",
        "enum": [
          0,
          1,
          2,
          3
        ],
        "type": "number"
      },
      {
        "flag": "ssl-expiration-reminder",
        "path": "sslExpirationReminder",
        "required": false,
        "description": "Whether to send SSL certificate expiration reminders",
        "type": "boolean"
      },
      {
        "flag": "is-active",
        "path": "isActive",
        "required": false,
        "description": "Activate (true) or pause (false) the alert contact",
        "type": "boolean"
      }
    ]
  },
  "incidents:activity-log": {
    "commandId": "incidents:activity-log",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns the activity log for an incident, including status updates, comments, and notifications. Sorted by date descending, newest first. Values can be paginated with the cursor parameter.",
    "destructive": false,
    "method": "GET",
    "operationId": "IncidentsController_getActivityLog",
    "parameters": [
      {
        "description": "ID of the incident",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      },
      {
        "description": "Cursor to paginate through further notification entries (comments, status updates and system events are only returned on the first page)",
        "example": "MjAyNi0wOS0xMiAxMDowMjowMXw0MjAwMDAwMDAwMDAwMDExfDQ0fDIwMA",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      },
      {
        "default": 50,
        "description": "Maximum number of notification entries per page (1-200, default 50). The first page also carries every comment, status update and system event on top of those, so it can hold more than `limit` entries.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/incidents/{id}/activity-log",
    "requestBodyRequired": false,
    "summary": "Get incident activity log",
    "tags": [
      "Incidents"
    ]
  },
  "incidents:alerts": {
    "commandId": "incidents:alerts",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns alerts that were sent for a specific incident, including recipient information and delivery status. Sorted by date descending, newest first. Values can be paginated with the cursor parameter.",
    "destructive": false,
    "method": "GET",
    "operationId": "IncidentsController_getAlerts",
    "parameters": [
      {
        "description": "ID of the incident",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      },
      {
        "description": "Cursor to paginate through sent alerts",
        "example": "MjAyNi0wOS0xMiAxMDowMjowMXw0MjAwMDAwMDAwMDAwMDExfDQ0fDIwMA",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      },
      {
        "default": 50,
        "description": "Number of sent alerts to return (1-200, default 50)",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/incidents/{id}/alerts",
    "requestBodyRequired": false,
    "summary": "Get incident sent alerts",
    "tags": [
      "Incidents"
    ]
  },
  "incidents:comments:create": {
    "commandId": "incidents:comments:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a new comment on an incident",
    "destructive": false,
    "method": "POST",
    "operationId": "IncidentsController_createComment",
    "parameters": [
      {
        "description": "ID of the incident",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      }
    ],
    "path": "/incidents/{id}/comments",
    "requestBodyRequired": true,
    "summary": "Create incident comment",
    "tags": [
      "Incidents"
    ],
    "requestBodyFields": [
      {
        "flag": "content",
        "path": "content",
        "required": true,
        "description": "Content of the comment",
        "example": "Investigating the issue...",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "publish-on-status-page",
        "path": "publishOnStatusPage",
        "required": false,
        "default": false,
        "description": "Whether the comment is published on the status page",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "incidents:comments:delete": {
    "commandId": "incidents:comments:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete a comment from an incident",
    "destructive": true,
    "method": "DELETE",
    "operationId": "IncidentsController_deleteComment",
    "parameters": [
      {
        "description": "ID of the incident",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      },
      {
        "description": "ID of the comment",
        "in": "path",
        "name": "commentId",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/incidents/{id}/comments/{commentId}",
    "requestBodyRequired": false,
    "summary": "Delete incident comment",
    "tags": [
      "Incidents"
    ]
  },
  "incidents:comments:list": {
    "commandId": "incidents:comments:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns paginated comments for a specific incident, ordered by creation date ascending (oldest first).",
    "destructive": false,
    "method": "GET",
    "operationId": "IncidentsController_listComments",
    "parameters": [
      {
        "description": "The incident ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      },
      {
        "description": "Cursor to paginate through comments (comment ID)",
        "example": "42",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      },
      {
        "default": 50,
        "description": "Number of comments to return (1-100, default 50)",
        "example": 50,
        "in": "query",
        "maximum": 100,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/incidents/{id}/comments",
    "requestBodyRequired": false,
    "summary": "List incident comments",
    "tags": [
      "Incidents"
    ]
  },
  "incidents:comments:update": {
    "commandId": "incidents:comments:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Updates an existing comment on an incident",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IncidentsController_updateComment",
    "parameters": [
      {
        "description": "The incident ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      },
      {
        "description": "The comment ID",
        "in": "path",
        "name": "commentId",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/incidents/{id}/comments/{commentId}",
    "requestBodyRequired": true,
    "summary": "Update an incident comment",
    "tags": [
      "Incidents"
    ],
    "requestBodyFields": [
      {
        "flag": "content",
        "path": "content",
        "required": true,
        "description": "Updated content of the comment",
        "example": "Issue has been identified and fix is in progress...",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "publish-on-status-page",
        "path": "publishOnStatusPage",
        "required": false,
        "default": false,
        "description": "Whether the comment is published on the status page",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "incidents:get": {
    "commandId": "incidents:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get incident details including root cause information",
    "destructive": false,
    "method": "GET",
    "operationId": "IncidentsController_get",
    "parameters": [
      {
        "description": "The incident ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      }
    ],
    "path": "/incidents/{id}",
    "requestBodyRequired": false,
    "summary": "Get an incident by ID",
    "tags": [
      "Incidents"
    ]
  },
  "incidents:list": {
    "commandId": "incidents:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List all incidents in a user's account with optional filtering. Values can be paginated with the cursor parameter.",
    "destructive": false,
    "method": "GET",
    "operationId": "IncidentsController_list",
    "parameters": [
      {
        "description": "Cursor to paginate through incidents (incident ID)",
        "example": "12345",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents by monitor ID",
        "example": 123,
        "in": "query",
        "minimum": 1,
        "name": "monitor_id",
        "required": false,
        "type": "number"
      },
      {
        "description": "Filter incidents by monitor name (partial match)",
        "example": "production",
        "in": "query",
        "name": "monitor_name",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents started after this date (ISO 8601 format)",
        "example": "2024-01-01T00:00:00Z",
        "in": "query",
        "name": "started_after",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents started before this date (ISO 8601 format)",
        "example": "2024-12-31T23:59:59Z",
        "in": "query",
        "name": "started_before",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents by status. \"open\" returns only currently ongoing incidents, regardless of started_after/started_before.",
        "enum": [
          "open"
        ],
        "in": "query",
        "name": "status",
        "required": false,
        "type": "string"
      }
    ],
    "path": "/incidents",
    "requestBodyRequired": false,
    "summary": "List incidents",
    "tags": [
      "Incidents"
    ]
  },
  "integrations:create": {
    "commandId": "integrations:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration",
    "tags": [
      "Integrations"
    ]
  },
  "integrations:create:discord": {
    "commandId": "integrations:create:discord",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Discord)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Discord"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "webhookURL": {
            "description": "The Discord Webhook URL to send the alert to",
            "example": "https://discord.com/api/webhooks/1234567890/abcdefg",
            "maxLength": 1500,
            "type": "string"
          },
          "customValue": {
            "description": "Optional. Text that will be added to body of each notification.",
            "example": "This is a custom value",
            "maxLength": 5000,
            "type": "string"
          },
          "friendlyName": {
            "maxLength": 60,
            "type": "string"
          },
          "sslExpirationReminder": {
            "type": "boolean"
          }
        },
        "requiredProperties": [
          "webhookURL",
          "customValue"
        ],
        "type": "object"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": true,
        "description": "The Discord Webhook URL to send the alert to",
        "example": "https://discord.com/api/webhooks/1234567890/abcdefg",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-value",
        "path": "data.customValue",
        "required": true,
        "description": "Optional. Text that will be added to body of each notification.",
        "example": "This is a custom value",
        "maxLength": 5000,
        "type": "string"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "type": "boolean"
      }
    ]
  },
  "integrations:create:google-chat": {
    "commandId": "integrations:create:google-chat",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (GoogleChat)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "GoogleChat"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "roomURL": {
            "description": "The Google Chat Room URL",
            "example": "https://chat.googleapis.com/v1/spaces/ABCD1234/...",
            "maxLength": 1500,
            "type": "string"
          },
          "customMessage": {
            "description": "Optional. Text that will be added to body of each notification.",
            "example": "This is a custom value",
            "maxLength": 5000,
            "type": "string"
          }
        },
        "requiredProperties": [
          "roomURL",
          "customMessage"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-room-url",
        "path": "data.roomURL",
        "required": true,
        "description": "The Google Chat Room URL",
        "example": "https://chat.googleapis.com/v1/spaces/ABCD1234/...",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-message",
        "path": "data.customMessage",
        "required": true,
        "description": "Optional. Text that will be added to body of each notification.",
        "example": "This is a custom value",
        "maxLength": 5000,
        "type": "string"
      }
    ]
  },
  "integrations:create:mattermost": {
    "commandId": "integrations:create:mattermost",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Mattermost)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Mattermost"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "webhookURL": {
            "description": "The Mattermost Webhook URL",
            "example": "https://your-mattermost-instance.com/hooks/<generated-token>",
            "maxLength": 1500,
            "type": "string"
          },
          "customValue": {
            "description": "Optional. Text that will be added to body of each notification.",
            "example": "This is a custom value",
            "maxLength": 5000,
            "type": "string"
          },
          "friendlyName": {
            "maxLength": 60,
            "type": "string"
          },
          "sslExpirationReminder": {
            "type": "boolean"
          }
        },
        "requiredProperties": [
          "webhookURL",
          "customValue"
        ],
        "type": "object"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": true,
        "description": "The Mattermost Webhook URL",
        "example": "https://your-mattermost-instance.com/hooks/<generated-token>",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-value",
        "path": "data.customValue",
        "required": true,
        "description": "Optional. Text that will be added to body of each notification.",
        "example": "This is a custom value",
        "maxLength": 5000,
        "type": "string"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "type": "boolean"
      }
    ]
  },
  "integrations:create:msteams": {
    "commandId": "integrations:create:msteams",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (MSTeams)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "MSTeams"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "webhookURL": {
            "description": "The Microsoft Teams Webhook URL",
            "example": "https://",
            "maxLength": 1500,
            "type": "string"
          }
        },
        "requiredProperties": [
          "webhookURL"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": true,
        "description": "The Microsoft Teams Webhook URL",
        "example": "https://",
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:create:pagerduty": {
    "commandId": "integrations:create:pagerduty",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Pagerduty)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Pagerduty"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "integrationKey": {
            "description": "The PagerDuty Integration Key",
            "example": "32 digits key",
            "minLength": 32,
            "type": "string"
          },
          "location": {
            "description": "The PagerDuty Service region",
            "enum": [
              "us",
              "eu"
            ],
            "type": "string"
          },
          "autoResolve": {
            "description": "Auto-resolve incidents after up event",
            "example": true,
            "type": "boolean"
          }
        },
        "requiredProperties": [
          "integrationKey"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-integration-key",
        "path": "data.integrationKey",
        "required": true,
        "description": "The PagerDuty Integration Key",
        "example": "32 digits key",
        "minLength": 32,
        "type": "string"
      },
      {
        "flag": "data-location",
        "path": "data.location",
        "required": false,
        "description": "The PagerDuty Service region",
        "enum": [
          "us",
          "eu"
        ],
        "type": "string"
      },
      {
        "flag": "data-auto-resolve",
        "path": "data.autoResolve",
        "required": false,
        "description": "Auto-resolve incidents after up event",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "integrations:create:push-bullet": {
    "commandId": "integrations:create:push-bullet",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (PushBullet)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "PushBullet"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "accessToken": {
            "description": "The Pushbullet Access Token",
            "example": "1234567890",
            "maxLength": 1500,
            "type": "string"
          }
        },
        "requiredProperties": [
          "accessToken"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-access-token",
        "path": "data.accessToken",
        "required": true,
        "description": "The Pushbullet Access Token",
        "example": "1234567890",
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:create:pushover": {
    "commandId": "integrations:create:pushover",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Pushover)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Pushover"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "userKey": {
            "description": "The Pushover User Key",
            "example": "abcdefxyz",
            "maxLength": 1500,
            "type": "string"
          },
          "priority": {
            "enum": [
              "Lowest",
              "Low",
              "Normal",
              "High",
              "Emergency"
            ],
            "type": "string"
          }
        },
        "requiredProperties": [
          "userKey"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-user-key",
        "path": "data.userKey",
        "required": true,
        "description": "The Pushover User Key",
        "example": "abcdefxyz",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-priority",
        "path": "data.priority",
        "required": false,
        "enum": [
          "Lowest",
          "Low",
          "Normal",
          "High",
          "Emergency"
        ],
        "type": "string"
      }
    ]
  },
  "integrations:create:slack": {
    "commandId": "integrations:create:slack",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Slack)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Slack"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "webhookURL": {
            "maxLength": 1500,
            "type": "string"
          },
          "customValue": {
            "maxLength": 5000,
            "type": "string"
          }
        },
        "requiredProperties": [
          "webhookURL",
          "customValue"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": true,
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-value",
        "path": "data.customValue",
        "required": true,
        "maxLength": 5000,
        "type": "string"
      }
    ]
  },
  "integrations:create:splunk": {
    "commandId": "integrations:create:splunk",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Splunk)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Splunk"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "urlToNotify": {
            "maxLength": 1500,
            "type": "string"
          }
        },
        "requiredProperties": [
          "urlToNotify"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-url-to-notify",
        "path": "data.urlToNotify",
        "required": true,
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:create:telegram": {
    "commandId": "integrations:create:telegram",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Telegram)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Telegram"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "integrations:create:webhook": {
    "commandId": "integrations:create:webhook",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Webhook)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Webhook"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "urlToNotify": {
            "maxLength": 1500,
            "type": "string"
          },
          "sendAsQueryString": {
            "type": "boolean"
          },
          "postValue": {
            "type": "string"
          },
          "sendAsJSON": {
            "type": "boolean"
          },
          "sendAsPostParameters": {
            "type": "boolean"
          },
          "customHeaders": {
            "nullable": true,
            "type": "object"
          }
        },
        "requiredProperties": [
          "urlToNotify",
          "postValue"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-url-to-notify",
        "path": "data.urlToNotify",
        "required": true,
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-send-as-query-string",
        "path": "data.sendAsQueryString",
        "required": false,
        "type": "boolean"
      },
      {
        "flag": "data-post-value",
        "path": "data.postValue",
        "required": true,
        "type": "string"
      },
      {
        "flag": "data-send-as-json",
        "path": "data.sendAsJSON",
        "required": false,
        "type": "boolean"
      },
      {
        "flag": "data-send-as-post-parameters",
        "path": "data.sendAsPostParameters",
        "required": false,
        "type": "boolean"
      },
      {
        "flag": "data-custom-headers",
        "path": "data.customHeaders",
        "required": false,
        "nullable": true,
        "type": "object"
      }
    ]
  },
  "integrations:create:zapier": {
    "commandId": "integrations:create:zapier",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create an Integration",
    "destructive": false,
    "method": "POST",
    "operationId": "IntegrationsController_create",
    "parameters": [],
    "path": "/integrations",
    "requestBodyRequired": true,
    "summary": "Create an Integration (Zapier)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Zapier"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "hookURL": {
            "maxLength": 1500,
            "type": "string"
          }
        },
        "requiredProperties": [
          "hookURL"
        ],
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-hook-url",
        "path": "data.hookURL",
        "required": true,
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:delete": {
    "commandId": "integrations:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete an Integration",
    "destructive": true,
    "method": "DELETE",
    "operationId": "IntegrationsController_delete",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": false,
    "summary": "Delete an Integration",
    "tags": [
      "Integrations"
    ]
  },
  "integrations:get": {
    "commandId": "integrations:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get an integration details by ID",
    "destructive": false,
    "method": "GET",
    "operationId": "IntegrationsController_get",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": false,
    "summary": "Get an integration by ID",
    "tags": [
      "Integrations"
    ]
  },
  "integrations:list": {
    "commandId": "integrations:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List Integrations",
    "destructive": false,
    "method": "GET",
    "operationId": "IntegrationsController_list",
    "parameters": [
      {
        "description": "Maximum number of integrations to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "When true and the caller owns an organization, include each active member's personal alert contacts (EmailToSms / Email / ProSms / Voice) in the response. Used by the v2 getAlertContacts proxy to restore the legacy org-roster scope.",
        "in": "query",
        "name": "includeOrgMembers",
        "required": false,
        "type": "boolean"
      },
      {
        "description": "Cursor to paginate through the integrations",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/integrations",
    "requestBodyRequired": false,
    "summary": "List Integrations",
    "tags": [
      "Integrations"
    ]
  },
  "integrations:update": {
    "commandId": "integrations:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration",
    "tags": [
      "Integrations"
    ]
  },
  "integrations:update:discord": {
    "commandId": "integrations:update:discord",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Discord)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Discord"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "webhookURL": {
            "description": "The Discord Webhook URL to send the alert to",
            "example": "https://discord.com/api/webhooks/1234567890/abcdefg",
            "maxLength": 1500,
            "type": "string"
          },
          "customValue": {
            "description": "Optional. Text that will be added to body of each notification.",
            "example": "This is a custom value",
            "maxLength": 5000,
            "type": "string"
          },
          "friendlyName": {
            "maxLength": 60,
            "type": "string"
          },
          "sslExpirationReminder": {
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": false,
        "description": "The Discord Webhook URL to send the alert to",
        "example": "https://discord.com/api/webhooks/1234567890/abcdefg",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-value",
        "path": "data.customValue",
        "required": false,
        "description": "Optional. Text that will be added to body of each notification.",
        "example": "This is a custom value",
        "maxLength": 5000,
        "type": "string"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "type": "boolean"
      }
    ]
  },
  "integrations:update:google-chat": {
    "commandId": "integrations:update:google-chat",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (GoogleChat)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "GoogleChat"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "roomURL": {
            "description": "The Google Chat Room URL",
            "example": "https://chat.googleapis.com/v1/spaces/ABCD1234/...",
            "maxLength": 1500,
            "type": "string"
          },
          "customMessage": {
            "description": "Optional. Text that will be added to body of each notification.",
            "example": "This is a custom value",
            "maxLength": 5000,
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-room-url",
        "path": "data.roomURL",
        "required": false,
        "description": "The Google Chat Room URL",
        "example": "https://chat.googleapis.com/v1/spaces/ABCD1234/...",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-message",
        "path": "data.customMessage",
        "required": false,
        "description": "Optional. Text that will be added to body of each notification.",
        "example": "This is a custom value",
        "maxLength": 5000,
        "type": "string"
      }
    ]
  },
  "integrations:update:mattermost": {
    "commandId": "integrations:update:mattermost",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Mattermost)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Mattermost"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "webhookURL": {
            "description": "The Mattermost Webhook URL",
            "example": "https://your-mattermost-instance.com/hooks/<generated-token>",
            "maxLength": 1500,
            "type": "string"
          },
          "customValue": {
            "description": "Optional. Text that will be added to body of each notification.",
            "example": "This is a custom value",
            "maxLength": 5000,
            "type": "string"
          },
          "friendlyName": {
            "maxLength": 60,
            "type": "string"
          },
          "sslExpirationReminder": {
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": false,
        "description": "The Mattermost Webhook URL",
        "example": "https://your-mattermost-instance.com/hooks/<generated-token>",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-value",
        "path": "data.customValue",
        "required": false,
        "description": "Optional. Text that will be added to body of each notification.",
        "example": "This is a custom value",
        "maxLength": 5000,
        "type": "string"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "type": "boolean"
      }
    ]
  },
  "integrations:update:msteams": {
    "commandId": "integrations:update:msteams",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (MSTeams)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "MSTeams"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "webhookURL": {
            "description": "The Microsoft Teams Webhook URL",
            "example": "https://",
            "maxLength": 1500,
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": false,
        "description": "The Microsoft Teams Webhook URL",
        "example": "https://",
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:update:pagerduty": {
    "commandId": "integrations:update:pagerduty",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Pagerduty)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Pagerduty"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "integrationKey": {
            "description": "The PagerDuty Integration Key",
            "example": "32 digits key",
            "minLength": 32,
            "type": "string"
          },
          "location": {
            "description": "The PagerDuty Service region",
            "enum": [
              "us",
              "eu"
            ],
            "type": "string"
          },
          "autoResolve": {
            "description": "Auto-resolve incidents after up event",
            "example": true,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-integration-key",
        "path": "data.integrationKey",
        "required": false,
        "description": "The PagerDuty Integration Key",
        "example": "32 digits key",
        "minLength": 32,
        "type": "string"
      },
      {
        "flag": "data-location",
        "path": "data.location",
        "required": false,
        "description": "The PagerDuty Service region",
        "enum": [
          "us",
          "eu"
        ],
        "type": "string"
      },
      {
        "flag": "data-auto-resolve",
        "path": "data.autoResolve",
        "required": false,
        "description": "Auto-resolve incidents after up event",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "integrations:update:push-bullet": {
    "commandId": "integrations:update:push-bullet",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (PushBullet)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "PushBullet"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "accessToken": {
            "description": "The Pushbullet Access Token",
            "example": "1234567890",
            "maxLength": 1500,
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-access-token",
        "path": "data.accessToken",
        "required": false,
        "description": "The Pushbullet Access Token",
        "example": "1234567890",
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:update:pushover": {
    "commandId": "integrations:update:pushover",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Pushover)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Pushover"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "userKey": {
            "description": "The Pushover User Key",
            "example": "abcdefxyz",
            "maxLength": 1500,
            "type": "string"
          },
          "priority": {
            "enum": [
              "Lowest",
              "Low",
              "Normal",
              "High",
              "Emergency"
            ],
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-user-key",
        "path": "data.userKey",
        "required": false,
        "description": "The Pushover User Key",
        "example": "abcdefxyz",
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-priority",
        "path": "data.priority",
        "required": false,
        "enum": [
          "Lowest",
          "Low",
          "Normal",
          "High",
          "Emergency"
        ],
        "type": "string"
      }
    ]
  },
  "integrations:update:slack": {
    "commandId": "integrations:update:slack",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Slack)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Slack"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "webhookURL": {
            "maxLength": 1500,
            "type": "string"
          },
          "customValue": {
            "maxLength": 5000,
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-webhook-url",
        "path": "data.webhookURL",
        "required": false,
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-custom-value",
        "path": "data.customValue",
        "required": false,
        "maxLength": 5000,
        "type": "string"
      }
    ]
  },
  "integrations:update:splunk": {
    "commandId": "integrations:update:splunk",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Splunk)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Splunk"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "urlToNotify": {
            "maxLength": 1500,
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-url-to-notify",
        "path": "data.urlToNotify",
        "required": false,
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "integrations:update:telegram": {
    "commandId": "integrations:update:telegram",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Telegram)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Telegram"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "integrations:update:webhook": {
    "commandId": "integrations:update:webhook",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Webhook)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Webhook"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "urlToNotify": {
            "maxLength": 1500,
            "type": "string"
          },
          "sendAsQueryString": {
            "type": "boolean"
          },
          "postValue": {
            "type": "string"
          },
          "sendAsJSON": {
            "type": "boolean"
          },
          "sendAsPostParameters": {
            "type": "boolean"
          },
          "customHeaders": {
            "nullable": true,
            "type": "object"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-url-to-notify",
        "path": "data.urlToNotify",
        "required": false,
        "maxLength": 1500,
        "type": "string"
      },
      {
        "flag": "data-send-as-query-string",
        "path": "data.sendAsQueryString",
        "required": false,
        "type": "boolean"
      },
      {
        "flag": "data-post-value",
        "path": "data.postValue",
        "required": false,
        "type": "string"
      },
      {
        "flag": "data-send-as-json",
        "path": "data.sendAsJSON",
        "required": false,
        "type": "boolean"
      },
      {
        "flag": "data-send-as-post-parameters",
        "path": "data.sendAsPostParameters",
        "required": false,
        "type": "boolean"
      },
      {
        "flag": "data-custom-headers",
        "path": "data.customHeaders",
        "required": false,
        "nullable": true,
        "type": "object"
      }
    ]
  },
  "integrations:update:zapier": {
    "commandId": "integrations:update:zapier",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an Integration",
    "destructive": false,
    "method": "PATCH",
    "operationId": "IntegrationsController_update",
    "parameters": [
      {
        "description": "ID of the integration",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/integrations/{id}",
    "requestBodyRequired": true,
    "summary": "Update an Integration (Zapier)",
    "tags": [
      "Integrations"
    ],
    "requestBodyDefaults": {
      "type": "Zapier"
    },
    "requestBodyFields": [
      {
        "flag": "data",
        "path": "data",
        "required": true,
        "properties": {
          "friendlyName": {
            "description": "The friendly name of the integration",
            "example": "My Integration from API",
            "maxLength": 60,
            "type": "string"
          },
          "enableNotificationsFor": {
            "enum": [
              "UpAndDown",
              "Down",
              "Up",
              "None"
            ],
            "type": "string"
          },
          "sslExpirationReminder": {
            "description": "Send a notification about SSL & Domain expiry",
            "example": true,
            "type": "boolean"
          },
          "hookURL": {
            "maxLength": 1500,
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "data-friendly-name",
        "path": "data.friendlyName",
        "required": false,
        "description": "The friendly name of the integration",
        "example": "My Integration from API",
        "maxLength": 60,
        "type": "string"
      },
      {
        "flag": "data-enable-notifications-for",
        "path": "data.enableNotificationsFor",
        "required": false,
        "enum": [
          "UpAndDown",
          "Down",
          "Up",
          "None"
        ],
        "type": "string"
      },
      {
        "flag": "data-ssl-expiration-reminder",
        "path": "data.sslExpirationReminder",
        "required": false,
        "description": "Send a notification about SSL & Domain expiry",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "data-hook-url",
        "path": "data.hookURL",
        "required": false,
        "maxLength": 1500,
        "type": "string"
      }
    ]
  },
  "maintenance-windows:create": {
    "commandId": "maintenance-windows:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a maintenance window",
    "destructive": false,
    "method": "POST",
    "operationId": "MaintenanceWindowsController_create",
    "parameters": [],
    "path": "/maintenance-windows",
    "requestBodyRequired": true,
    "summary": "Create a maintenance window",
    "tags": [
      "Maintenance Windows"
    ],
    "requestBodyFields": [
      {
        "flag": "name",
        "path": "name",
        "required": true,
        "description": "Friendly name of the maintenance window",
        "example": "Friday Maintenance window",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "auto-add-monitors",
        "path": "autoAddMonitors",
        "required": false,
        "description": "If true, all monitors are automatically added to this maintenance window",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "enum": [
          "once",
          "daily",
          "weekly",
          "monthly"
        ],
        "type": "string"
      },
      {
        "flag": "date",
        "path": "date",
        "required": true,
        "description": "Start date of the maintenance window in YYYY-MM-DD format (years 19xx or 20xx only)",
        "example": "2024-06-20",
        "type": "string"
      },
      {
        "flag": "time",
        "path": "time",
        "required": true,
        "description": "Start time of the maintenance window in HH:mm:ss format",
        "example": "14:30:00",
        "type": "string"
      },
      {
        "flag": "duration",
        "path": "duration",
        "required": true,
        "description": "Duration of the maintenance window in minutes. Maintenance window will be active for this duration",
        "example": 30,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "days",
        "path": "days",
        "required": false,
        "description": "(only needed for weekly and monthly maintenance windows). E.g. [2, 4, 5] for Tuesday, Thursday and Friday or [10, 17, 26] for the days of the month. -1 for last day of the month)",
        "example": [
          2,
          4,
          5
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "monitor-ids",
        "path": "monitorIds",
        "required": false,
        "description": "List of monitor IDs to be assigned to the maintenance window",
        "example": [
          1,
          2,
          3
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      }
    ]
  },
  "maintenance-windows:delete": {
    "commandId": "maintenance-windows:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete a maintenance window",
    "destructive": true,
    "method": "DELETE",
    "operationId": "MaintenanceWindowsController_delete",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/maintenance-windows/{id}",
    "requestBodyRequired": false,
    "summary": "Delete a maintenance window",
    "tags": [
      "Maintenance Windows"
    ]
  },
  "maintenance-windows:get": {
    "commandId": "maintenance-windows:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get a maintenance window by ID",
    "destructive": false,
    "method": "GET",
    "operationId": "MaintenanceWindowsController_get",
    "parameters": [
      {
        "description": "ID of the maintenance window",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/maintenance-windows/{id}",
    "requestBodyRequired": false,
    "summary": "Get a maintenance window by ID",
    "tags": [
      "Maintenance Windows"
    ]
  },
  "maintenance-windows:list": {
    "commandId": "maintenance-windows:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List maintenance windows",
    "destructive": false,
    "method": "GET",
    "operationId": "MaintenanceWindowsController_list",
    "parameters": [
      {
        "description": "Maximum number of maintenance windows to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      }
    ],
    "path": "/maintenance-windows",
    "requestBodyRequired": false,
    "summary": "List maintenance windows",
    "tags": [
      "Maintenance Windows"
    ]
  },
  "maintenance-windows:update": {
    "commandId": "maintenance-windows:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update a maintenance window",
    "destructive": false,
    "method": "PATCH",
    "operationId": "MaintenanceWindowsController_update",
    "parameters": [
      {
        "description": "ID of the maintenance window",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/maintenance-windows/{id}",
    "requestBodyRequired": true,
    "summary": "Update a maintenance window",
    "tags": [
      "Maintenance Windows"
    ],
    "requestBodyFields": [
      {
        "flag": "name",
        "path": "name",
        "required": false,
        "description": "Name of the maintenance window",
        "example": "Weekend Maintenance Window",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": false,
        "enum": [
          "once",
          "daily",
          "weekly",
          "monthly"
        ],
        "type": "string"
      },
      {
        "flag": "date",
        "path": "date",
        "required": false,
        "description": "Start date of the maintenance window in YYYY-MM-DD format (years 19xx or 20xx only)",
        "example": "2024-06-20",
        "type": "string"
      },
      {
        "flag": "time",
        "path": "time",
        "required": false,
        "description": "Time format in HH:mm:ss",
        "example": "12:00:00",
        "type": "string"
      },
      {
        "flag": "duration",
        "path": "duration",
        "required": false,
        "description": "Duration in minutes",
        "example": 10,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "days",
        "path": "days",
        "required": false,
        "description": "(only needed for weekly and monthly maintenance windows). E.g. [2, 4, 5] for Tuesday, Thursday and Friday or [10, 17, 26] for the days of the month. -1 for last day of the month)",
        "example": [
          2,
          4,
          5
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "monitor-ids",
        "path": "monitorIds",
        "required": false,
        "description": "Array of monitor IDs to associate with this maintenance window",
        "example": [
          1,
          2,
          3
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "status",
        "path": "status",
        "required": false,
        "description": "Pause or resume the maintenance window. `paused` stops it from suppressing alerts; `active` re-enables it. Omit to leave the current status unchanged.",
        "enum": [
          "active",
          "paused"
        ],
        "example": "active",
        "type": "string"
      }
    ]
  },
  "monitor-groups:create": {
    "commandId": "monitor-groups:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a new monitor group with optional initial monitors. Monitors can be assigned by providing their IDs or by specifying existing group IDs whose monitors should be moved.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorGroupsController_create",
    "parameters": [],
    "path": "/monitor-groups",
    "requestBodyRequired": true,
    "summary": "Create a monitor group",
    "tags": [
      "Monitor Groups"
    ],
    "requestBodyFields": [
      {
        "flag": "name",
        "path": "name",
        "required": true,
        "description": "Name of the monitor group",
        "example": "Production Monitors",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "monitor-ids",
        "path": "monitorIds",
        "required": false,
        "description": "List of monitor IDs to be assigned to this group",
        "example": [
          1,
          2,
          3
        ],
        "items": {
          "minimum": 1,
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "group-ids",
        "path": "groupIds",
        "required": false,
        "description": "List of group IDs whose monitors should be moved to this new group",
        "example": [
          1,
          2
        ],
        "items": {
          "minimum": 0,
          "type": "number"
        },
        "type": "array"
      }
    ]
  },
  "monitor-groups:delete": {
    "commandId": "monitor-groups:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete a monitor group. Monitors in the deleted group will be moved to the specified group or to the default group (ID: 0).",
    "destructive": true,
    "method": "DELETE",
    "operationId": "MonitorGroupsController_delete",
    "parameters": [
      {
        "description": "The monitor group ID to delete",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      },
      {
        "description": "Optional group ID to move monitors to. If not provided, monitors will be moved to default group (ID: 0).",
        "example": 123,
        "in": "query",
        "minimum": 1,
        "name": "monitorsNewGroupId",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/monitor-groups/{id}",
    "requestBodyRequired": false,
    "summary": "Delete a monitor group",
    "tags": [
      "Monitor Groups"
    ]
  },
  "monitor-groups:get": {
    "commandId": "monitor-groups:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get monitor group details by ID",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorGroupsController_get",
    "parameters": [
      {
        "description": "The monitor group ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitor-groups/{id}",
    "requestBodyRequired": false,
    "summary": "Get a monitor group by ID",
    "tags": [
      "Monitor Groups"
    ]
  },
  "monitor-groups:list": {
    "commandId": "monitor-groups:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List all monitor groups in a user's account. Values can be paginated with the cursor parameter.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorGroupsController_list",
    "parameters": [
      {
        "description": "Maximum number of monitor groups to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Cursor for pagination (ID of the last item from previous page)",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/monitor-groups",
    "requestBodyRequired": false,
    "summary": "List monitor groups",
    "tags": [
      "Monitor Groups"
    ]
  },
  "monitor-groups:update": {
    "commandId": "monitor-groups:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update (rename) an existing monitor group",
    "destructive": false,
    "method": "PATCH",
    "operationId": "MonitorGroupsController_update",
    "parameters": [
      {
        "description": "The monitor group ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitor-groups/{id}",
    "requestBodyRequired": true,
    "summary": "Update a monitor group",
    "tags": [
      "Monitor Groups"
    ],
    "requestBodyFields": [
      {
        "flag": "name",
        "path": "name",
        "required": false,
        "description": "Name of the monitor group",
        "example": "Production Monitors",
        "maxLength": 255,
        "type": "string"
      }
    ]
  },
  "monitors:bulk:pause": {
    "commandId": "monitors:bulk:pause",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Pauses monitors matching the specified filters. Provide groupId, tagId, or both. When both are given, only monitors matching both filters are affected. Returns per-monitor results.",
    "destructive": false,
    "method": "POST",
    "operationId": "BulkMonitorsController_bulkPause",
    "parameters": [],
    "path": "/monitors/bulk/pause",
    "requestBodyRequired": true,
    "summary": "Pause monitors by group and/or tag",
    "tags": [
      "Monitors - Bulk Operations"
    ],
    "requestBodyFields": [
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "ID of the monitor group to filter by (0 = default group / ungrouped monitors). At least one of groupId or tagId must be provided.",
        "example": 1,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "tag-id",
        "path": "tagId",
        "required": false,
        "description": "ID of the tag to filter by. At least one of groupId or tagId must be provided. When both groupId and tagId are specified, only monitors matching both filters are affected.",
        "example": 42,
        "minimum": 1,
        "type": "number"
      }
    ]
  },
  "monitors:bulk:start": {
    "commandId": "monitors:bulk:start",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Starts all paused monitors matching the specified filters. Provide groupId, tagId, or both. When both are given, only monitors matching both filters are affected. Returns per-monitor results.",
    "destructive": false,
    "method": "POST",
    "operationId": "BulkMonitorsController_bulkStart",
    "parameters": [],
    "path": "/monitors/bulk/start",
    "requestBodyRequired": true,
    "summary": "Start monitors by group and/or tag",
    "tags": [
      "Monitors - Bulk Operations"
    ],
    "requestBodyFields": [
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "ID of the monitor group to filter by (0 = default group / ungrouped monitors). At least one of groupId or tagId must be provided.",
        "example": 1,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "tag-id",
        "path": "tagId",
        "required": false,
        "description": "ID of the tag to filter by. At least one of groupId or tagId must be provided. When both groupId and tagId are specified, only monitors matching both filters are affected.",
        "example": 42,
        "minimum": 1,
        "type": "number"
      }
    ]
  },
  "monitors:bulk:update": {
    "commandId": "monitors:bulk:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Updates settings for monitors matching the specified filters. Provide groupId, tagId, or both. When both are given, only monitors matching both filters are affected. Returns per-monitor results.",
    "destructive": false,
    "method": "POST",
    "operationId": "BulkMonitorsController_bulkUpdate",
    "parameters": [],
    "path": "/monitors/bulk/update",
    "requestBodyRequired": true,
    "summary": "Update monitors by group and/or tag",
    "tags": [
      "Monitors - Bulk Operations"
    ],
    "requestBodyFields": [
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "ID of the monitor group to filter by (0 = default group / ungrouped monitors). At least one of groupId or tagId must be provided.",
        "example": 1,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "tag-id",
        "path": "tagId",
        "required": false,
        "description": "ID of the tag to filter by. At least one of groupId or tagId must be provided. When both groupId and tagId are specified, only monitors matching both filters are affected.",
        "example": 42,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": false,
        "description": "Monitoring interval in seconds",
        "example": 60,
        "minimum": 15,
        "type": "number"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": false,
        "description": "Timeout in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "grace-period",
        "path": "gracePeriod",
        "required": false,
        "description": "Grace period in seconds",
        "example": 300,
        "maximum": 86400,
        "minimum": 0,
        "type": "number"
      },
      {
        "aliases": [
          "check-ssl-errors"
        ],
        "flag": "check-ssl",
        "path": "checkSSLErrors",
        "required": false,
        "description": "Whether to check for SSL errors",
        "type": "boolean"
      },
      {
        "flag": "domain-expiration-reminder",
        "path": "domainExpirationReminder",
        "required": false,
        "description": "Whether to enable domain expiration reminder",
        "type": "boolean"
      },
      {
        "flag": "ssl-expiration-reminder",
        "path": "sslExpirationReminder",
        "required": false,
        "description": "Whether to enable SSL expiration reminder",
        "type": "boolean"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Regional data configuration",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "flag": "regional-data-region",
        "path": "regionalData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array"
      },
      {
        "flag": "regional-data-manual-selected",
        "path": "regionalData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "flag": "regional-data-threshold",
        "path": "regionalData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "flag": "regional-data-threshold-na",
        "path": "regionalData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "flag": "regional-data-threshold-eu",
        "path": "regionalData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "flag": "regional-data-threshold-as",
        "path": "regionalData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "flag": "regional-data-threshold-oc",
        "path": "regionalData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "description": "Custom key-value metadata to set on all monitors in the group. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      }
    ]
  },
  "monitors:create": {
    "commandId": "monitors:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor",
    "tags": [
      "Monitors"
    ],
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My HTTP monitor",
          "type": "HTTP",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30
        },
        "name": "HTTP Monitor"
      },
      {
        "body": {
          "friendlyName": "My HTTP monitor",
          "type": "HTTP",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30,
          "config": {
            "ipVersion": "ipv6Only"
          }
        },
        "name": "HTTP/Keyword Monitor (IP version)"
      },
      {
        "body": {
          "friendlyName": "My HTTPS monitor",
          "type": "HTTP",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30,
          "config": {
            "sslExpirationPeriodDays": [
              7,
              14,
              30
            ]
          }
        },
        "name": "HTTP/Keyword Monitor (SSL expiration periods)"
      },
      {
        "body": {
          "friendlyName": "My Keyword monitor",
          "type": "KEYWORD",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30,
          "keywordType": "ALERT_EXISTS",
          "keywordCaseType": "CaseSensitive",
          "keywordValue": "Service Unavailable"
        },
        "name": "Keyword Monitor"
      },
      {
        "body": {
          "friendlyName": "My Ping monitor",
          "type": "PING",
          "url": "example.com",
          "interval": 60,
          "timeout": 30
        },
        "name": "Ping Monitor"
      },
      {
        "body": {
          "friendlyName": "My Port monitor",
          "type": "PORT",
          "url": "example.com",
          "port": 443,
          "interval": 60,
          "timeout": 30
        },
        "name": "Port Monitor"
      },
      {
        "body": {
          "friendlyName": "My Heartbeat monitor",
          "type": "HEARTBEAT",
          "interval": 60,
          "gracePeriod": 300
        },
        "name": "Heartbeat Monitor"
      },
      {
        "body": {
          "friendlyName": "My DNS monitor",
          "type": "DNS",
          "url": "example.com",
          "interval": 60,
          "config": {
            "dnsRecords": {
              "CNAME": [
                "example.com"
              ],
              "MX": [
                "1 aspmx.l.google.com.",
                "5 alt1.aspmx.l.google.com."
              ],
              "NS": [
                "ns-cloud-a1.googledomains.com.",
                "ns-cloud-a2.googledomains.com."
              ],
              "A": [
                "192.168.1.1"
              ],
              "PTR": [
                "example.com"
              ]
            }
          }
        },
        "name": "DNS Monitor"
      },
      {
        "body": {
          "friendlyName": "My API monitor",
          "type": "API",
          "url": "https://api.example.com/health",
          "interval": 60,
          "timeout": 30,
          "config": {
            "apiAssertions": {
              "logic": "AND",
              "checks": [
                {
                  "property": "$.data.status",
                  "comparison": "equals",
                  "target": "active"
                },
                {
                  "property": "$.data.count",
                  "comparison": "greater_than",
                  "target": 0
                }
              ]
            },
            "ipVersion": "ipv4Only",
            "sslExpirationPeriodDays": [
              7,
              14,
              30
            ]
          }
        },
        "name": "API Monitor"
      },
      {
        "body": {
          "friendlyName": "My UDP monitor",
          "type": "UDP",
          "url": "1.2.3.4",
          "port": 53,
          "interval": 60,
          "timeout": 30,
          "config": {
            "udp": {
              "payload": "ping",
              "packetLossThreshold": 50
            }
          }
        },
        "name": "UDP Monitor"
      },
      {
        "body": {
          "friendlyName": "My Visual Comparison monitor",
          "type": "VISUAL_COMPARISON",
          "url": "https://example.com",
          "interval": 300,
          "config": {
            "visualComparison": {
              "sensitivityThreshold": 10,
              "viewport": "desktop"
            }
          }
        },
        "name": "Visual Comparison Monitor"
      },
      {
        "body": {
          "type": "THIRD_PARTY_SERVICE",
          "config": {
            "thirdPartyService": {
              "providerId": 4317
            }
          }
        },
        "name": "Third Party Service"
      }
    ]
  },
  "monitors:create:api": {
    "commandId": "monitors:create:api",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (API)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "API"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My API monitor",
          "type": "API",
          "url": "https://api.example.com/health",
          "interval": 60,
          "timeout": 30,
          "config": {
            "apiAssertions": {
              "logic": "AND",
              "checks": [
                {
                  "property": "$.data.status",
                  "comparison": "equals",
                  "target": "active"
                },
                {
                  "property": "$.data.count",
                  "comparison": "greater_than",
                  "target": 0
                }
              ]
            },
            "ipVersion": "ipv4Only",
            "sslExpirationPeriodDays": [
              7,
              14,
              30
            ]
          }
        },
        "name": "API Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "aliases": [
          "http-method-type"
        ],
        "flag": "method",
        "path": "httpMethodType",
        "required": false,
        "description": "HTTP method to use for the request. Defaults to GET. HEAD is not allowed for API monitors because assertions need a response body",
        "enum": [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
          "QUERY"
        ],
        "example": "GET",
        "type": "string"
      },
      {
        "flag": "auth-type",
        "path": "authType",
        "required": false,
        "description": "Authentication method to use for the request",
        "enum": [
          "NONE",
          "HTTP_BASIC",
          "DIGEST",
          "BEARER"
        ],
        "example": "NONE",
        "type": "string"
      },
      {
        "flag": "http-username",
        "path": "httpUsername",
        "required": false,
        "description": "Username for HTTP Basic authentication",
        "example": "admin",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "http-password",
        "path": "httpPassword",
        "required": false,
        "description": "Password for HTTP Basic authentication",
        "example": "password",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "post-value-data",
        "path": "postValueData",
        "required": false,
        "description": "Data to be sent in the request. Not applicable for HTTP method type = HEAD. Can be a JSON object or string",
        "type": "json"
      },
      {
        "flag": "post-value-type",
        "path": "postValueType",
        "required": false,
        "description": "Type of data payload to be sent in the request. Affects what data is accepted by \"postValueData\" field",
        "enum": [
          "KEY_VALUE",
          "RAW_JSON"
        ],
        "example": "RAW_JSON",
        "type": "string"
      },
      {
        "flag": "custom-http-headers",
        "path": "customHttpHeaders",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom HTTP headers to be sent in the request. Must be sent as JSON object with key-value pairs. The serialized JSON must not exceed 3000 characters",
        "example": {
          "X-Custom-Header": "value"
        },
        "type": "object"
      },
      {
        "flag": "success-http-response-codes",
        "path": "successHttpResponseCodes",
        "required": false,
        "description": "Success HTTP response codes. Can contain specific codes or ranges like 2xx. Default is [2xx, 3xx]",
        "example": [
          "2xx",
          "3xx"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "aliases": [
          "check-ssl-errors"
        ],
        "flag": "check-ssl",
        "path": "checkSSLErrors",
        "required": false,
        "description": "Whether to check for SSL and domain expiration errors",
        "type": "boolean"
      },
      {
        "flag": "ssl-expiration-reminder",
        "path": "sslExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the SSL certificate is about to expire",
        "type": "boolean"
      },
      {
        "flag": "domain-expiration-reminder",
        "path": "domainExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the domain is about to expire",
        "type": "boolean"
      },
      {
        "aliases": [
          "follow-redirections"
        ],
        "flag": "follow-redirects",
        "path": "followRedirections",
        "required": false,
        "description": "Whether to follow redirections",
        "type": "boolean"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "URL of the API endpoint to monitor",
        "example": "https://api.example.com/health",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": true,
        "description": "Timeout of check in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config",
        "path": "config",
        "required": true,
        "description": "API monitor configuration. `apiAssertions` is required — at least one check must be provided",
        "properties": {
          "apiAssertions": {
            "description": "API monitor assertions configuration",
            "properties": {
              "logic": {
                "description": "Logic for combining assertions",
                "enum": [
                  "AND",
                  "OR"
                ],
                "example": "AND",
                "type": "string"
              },
              "checks": {
                "description": "Array of assertion checks (1-5)",
                "items": {
                  "properties": {
                    "property": {
                      "description": "Assertion source: safe JSONPath, headers.<name>, status_code, or body",
                      "example": "$.data.status",
                      "maxLength": 500,
                      "type": "string"
                    },
                    "comparison": {
                      "description": "Comparison operator",
                      "enum": [
                        "equals",
                        "not_equals",
                        "contains",
                        "not_contains",
                        "greater_than",
                        "less_than",
                        "is_null",
                        "is_not_null",
                        "is_string",
                        "is_number",
                        "is_boolean",
                        "is_array",
                        "is_object",
                        "is_empty",
                        "is_not_empty",
                        "length_equals",
                        "length_not_equals",
                        "length_greater_than",
                        "length_less_than",
                        "exists",
                        "not_exists"
                      ],
                      "example": "equals",
                      "type": "string"
                    },
                    "target": {
                      "description": "Expected native JSON value. Arrays and objects are supported for body-JSON equality and containment; omit target for null, type, existence, and empty comparisons.",
                      "example": [
                        "active",
                        {
                          "role": "primary"
                        }
                      ],
                      "type": "json"
                    }
                  },
                  "requiredProperties": [
                    "property",
                    "comparison"
                  ],
                  "type": "object"
                },
                "type": "array"
              }
            },
            "requiredProperties": [
              "logic",
              "checks"
            ],
            "type": "object"
          },
          "sslExpirationPeriodDays": {
            "description": "SSL expiration period in days (0-365, max 10 items)",
            "example": [
              7,
              14,
              30
            ],
            "items": {
              "maximum": 365,
              "minimum": 0,
              "type": "number"
            },
            "maxItems": 10,
            "type": "array"
          },
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "type": "string"
          },
          "applicationErrorRetries": {
            "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting.",
            "example": 1,
            "maximum": 3,
            "minimum": 0,
            "type": "number"
          }
        },
        "requiredProperties": [
          "apiAssertions"
        ],
        "type": "object"
      },
      {
        "flag": "config-api-assertions",
        "path": "config.apiAssertions",
        "required": true,
        "description": "API monitor assertions configuration",
        "properties": {
          "logic": {
            "description": "Logic for combining assertions",
            "enum": [
              "AND",
              "OR"
            ],
            "example": "AND",
            "type": "string"
          },
          "checks": {
            "description": "Array of assertion checks (1-5)",
            "items": {
              "properties": {
                "property": {
                  "description": "Assertion source: safe JSONPath, headers.<name>, status_code, or body",
                  "example": "$.data.status",
                  "maxLength": 500,
                  "type": "string"
                },
                "comparison": {
                  "description": "Comparison operator",
                  "enum": [
                    "equals",
                    "not_equals",
                    "contains",
                    "not_contains",
                    "greater_than",
                    "less_than",
                    "is_null",
                    "is_not_null",
                    "is_string",
                    "is_number",
                    "is_boolean",
                    "is_array",
                    "is_object",
                    "is_empty",
                    "is_not_empty",
                    "length_equals",
                    "length_not_equals",
                    "length_greater_than",
                    "length_less_than",
                    "exists",
                    "not_exists"
                  ],
                  "example": "equals",
                  "type": "string"
                },
                "target": {
                  "description": "Expected native JSON value. Arrays and objects are supported for body-JSON equality and containment; omit target for null, type, existence, and empty comparisons.",
                  "example": [
                    "active",
                    {
                      "role": "primary"
                    }
                  ],
                  "type": "json"
                }
              },
              "requiredProperties": [
                "property",
                "comparison"
              ],
              "type": "object"
            },
            "type": "array"
          }
        },
        "requiredProperties": [
          "logic",
          "checks"
        ],
        "type": "object"
      },
      {
        "flag": "config-api-assertions-logic",
        "path": "config.apiAssertions.logic",
        "required": true,
        "description": "Logic for combining assertions",
        "enum": [
          "AND",
          "OR"
        ],
        "example": "AND",
        "type": "string"
      },
      {
        "flag": "config-api-assertions-checks",
        "path": "config.apiAssertions.checks",
        "required": true,
        "description": "Array of assertion checks (1-5)",
        "items": {
          "properties": {
            "property": {
              "description": "Assertion source: safe JSONPath, headers.<name>, status_code, or body",
              "example": "$.data.status",
              "maxLength": 500,
              "type": "string"
            },
            "comparison": {
              "description": "Comparison operator",
              "enum": [
                "equals",
                "not_equals",
                "contains",
                "not_contains",
                "greater_than",
                "less_than",
                "is_null",
                "is_not_null",
                "is_string",
                "is_number",
                "is_boolean",
                "is_array",
                "is_object",
                "is_empty",
                "is_not_empty",
                "length_equals",
                "length_not_equals",
                "length_greater_than",
                "length_less_than",
                "exists",
                "not_exists"
              ],
              "example": "equals",
              "type": "string"
            },
            "target": {
              "description": "Expected native JSON value. Arrays and objects are supported for body-JSON equality and containment; omit target for null, type, existence, and empty comparisons.",
              "example": [
                "active",
                {
                  "role": "primary"
                }
              ],
              "type": "json"
            }
          },
          "requiredProperties": [
            "property",
            "comparison"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "config-ssl-expiration-period-days",
        "path": "config.sslExpirationPeriodDays",
        "required": false,
        "description": "SSL expiration period in days (0-365, max 10 items)",
        "example": [
          7,
          14,
          30
        ],
        "items": {
          "maximum": 365,
          "minimum": 0,
          "type": "number"
        },
        "maxItems": 10,
        "type": "array"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "type": "string"
      },
      {
        "flag": "config-application-error-retries",
        "path": "config.applicationErrorRetries",
        "required": false,
        "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting.",
        "example": 1,
        "maximum": 3,
        "minimum": 0,
        "type": "number"
      }
    ]
  },
  "monitors:create:dns": {
    "commandId": "monitors:create:dns",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (DNS)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "DNS"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My DNS monitor",
          "type": "DNS",
          "url": "example.com",
          "interval": 60,
          "config": {
            "dnsRecords": {
              "CNAME": [
                "example.com"
              ],
              "MX": [
                "1 aspmx.l.google.com.",
                "5 alt1.aspmx.l.google.com."
              ],
              "NS": [
                "ns-cloud-a1.googledomains.com.",
                "ns-cloud-a2.googledomains.com."
              ],
              "A": [
                "192.168.1.1"
              ],
              "PTR": [
                "example.com"
              ]
            }
          }
        },
        "name": "DNS Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "DNS server IP or hostname. A protocol prefix is stripped if provided",
        "example": "example.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "config",
        "path": "config",
        "required": true,
        "description": "DNS monitor configuration — the records to resolve and match",
        "properties": {
          "dnsRecords": {
            "description": "DNS records configuration",
            "properties": {
              "CNAME": {
                "description": "CNAME DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "MX": {
                "description": "MX DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "NS": {
                "description": "NS DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "A": {
                "description": "A DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "AAAA": {
                "description": "AAAA DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "TXT": {
                "description": "TXT DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "SRV": {
                "description": "SRV DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "PTR": {
                "description": "PTR DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "SOA": {
                "description": "SOA DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "SPF": {
                "description": "SPF DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "DNSKEY": {
                "description": "DNSKEY DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "DS": {
                "description": "DS DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "NSEC": {
                "description": "NSEC DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "NSEC3": {
                "description": "NSEC3 DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              }
            },
            "type": "object"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-dns-records",
        "path": "config.dnsRecords",
        "required": false,
        "description": "DNS records configuration",
        "properties": {
          "CNAME": {
            "description": "CNAME DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "MX": {
            "description": "MX DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "NS": {
            "description": "NS DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "A": {
            "description": "A DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "AAAA": {
            "description": "AAAA DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "TXT": {
            "description": "TXT DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "SRV": {
            "description": "SRV DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "PTR": {
            "description": "PTR DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "SOA": {
            "description": "SOA DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "SPF": {
            "description": "SPF DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "DNSKEY": {
            "description": "DNSKEY DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "DS": {
            "description": "DS DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "NSEC": {
            "description": "NSEC DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "NSEC3": {
            "description": "NSEC3 DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-dns-records-cname",
        "path": "config.dnsRecords.CNAME",
        "required": false,
        "description": "CNAME DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-mx",
        "path": "config.dnsRecords.MX",
        "required": false,
        "description": "MX DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-ns",
        "path": "config.dnsRecords.NS",
        "required": false,
        "description": "NS DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-a",
        "path": "config.dnsRecords.A",
        "required": false,
        "description": "A DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-aaaa",
        "path": "config.dnsRecords.AAAA",
        "required": false,
        "description": "AAAA DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-txt",
        "path": "config.dnsRecords.TXT",
        "required": false,
        "description": "TXT DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-srv",
        "path": "config.dnsRecords.SRV",
        "required": false,
        "description": "SRV DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-ptr",
        "path": "config.dnsRecords.PTR",
        "required": false,
        "description": "PTR DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-soa",
        "path": "config.dnsRecords.SOA",
        "required": false,
        "description": "SOA DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-spf",
        "path": "config.dnsRecords.SPF",
        "required": false,
        "description": "SPF DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-dnskey",
        "path": "config.dnsRecords.DNSKEY",
        "required": false,
        "description": "DNSKEY DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-ds",
        "path": "config.dnsRecords.DS",
        "required": false,
        "description": "DS DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-nsec",
        "path": "config.dnsRecords.NSEC",
        "required": false,
        "description": "NSEC DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-nsec3",
        "path": "config.dnsRecords.NSEC3",
        "required": false,
        "description": "NSEC3 DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      }
    ]
  },
  "monitors:create:heartbeat": {
    "commandId": "monitors:create:heartbeat",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (HEARTBEAT)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "HEARTBEAT"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My Heartbeat monitor",
          "type": "HEARTBEAT",
          "interval": 60,
          "gracePeriod": 300
        },
        "name": "Heartbeat Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "grace-period",
        "path": "gracePeriod",
        "required": false,
        "description": "Grace period in seconds to wait past the expected heartbeat before alerting",
        "example": 300,
        "maximum": 86400,
        "minimum": 0,
        "type": "number"
      }
    ]
  },
  "monitors:create:http": {
    "commandId": "monitors:create:http",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (HTTP)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "HTTP"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My HTTP monitor",
          "type": "HTTP",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30
        },
        "name": "HTTP Monitor"
      },
      {
        "body": {
          "friendlyName": "My HTTP monitor",
          "type": "HTTP",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30,
          "config": {
            "ipVersion": "ipv6Only"
          }
        },
        "name": "HTTP/Keyword Monitor (IP version)"
      },
      {
        "body": {
          "friendlyName": "My HTTPS monitor",
          "type": "HTTP",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30,
          "config": {
            "sslExpirationPeriodDays": [
              7,
              14,
              30
            ]
          }
        },
        "name": "HTTP/Keyword Monitor (SSL expiration periods)"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "aliases": [
          "http-method-type"
        ],
        "flag": "method",
        "path": "httpMethodType",
        "required": false,
        "description": "HTTP method to use for the request. For HTTP and Keyword monitors it defaults to HEAD if omitted",
        "enum": [
          "HEAD",
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
          "QUERY"
        ],
        "example": "HEAD",
        "type": "string"
      },
      {
        "flag": "auth-type",
        "path": "authType",
        "required": false,
        "description": "Authentication method to use for the request",
        "enum": [
          "NONE",
          "HTTP_BASIC",
          "DIGEST",
          "BEARER"
        ],
        "example": "NONE",
        "type": "string"
      },
      {
        "flag": "http-username",
        "path": "httpUsername",
        "required": false,
        "description": "Username for HTTP Basic authentication",
        "example": "admin",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "http-password",
        "path": "httpPassword",
        "required": false,
        "description": "Password for HTTP Basic authentication",
        "example": "password",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "post-value-data",
        "path": "postValueData",
        "required": false,
        "description": "Data to be sent in the request. Not applicable for HTTP method type = HEAD. Can be a JSON object or string",
        "type": "json"
      },
      {
        "flag": "post-value-type",
        "path": "postValueType",
        "required": false,
        "description": "Type of data payload to be sent in the request. Affects what data is accepted by \"postValueData\" field",
        "enum": [
          "KEY_VALUE",
          "RAW_JSON"
        ],
        "example": "RAW_JSON",
        "type": "string"
      },
      {
        "flag": "custom-http-headers",
        "path": "customHttpHeaders",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom HTTP headers to be sent in the request. Must be sent as JSON object with key-value pairs. The serialized JSON must not exceed 3000 characters",
        "example": {
          "X-Custom-Header": "value"
        },
        "type": "object"
      },
      {
        "flag": "success-http-response-codes",
        "path": "successHttpResponseCodes",
        "required": false,
        "description": "Success HTTP response codes. Can contain specific codes or ranges like 2xx. Default is [2xx, 3xx]",
        "example": [
          "2xx",
          "3xx"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "aliases": [
          "check-ssl-errors"
        ],
        "flag": "check-ssl",
        "path": "checkSSLErrors",
        "required": false,
        "description": "Whether to check for SSL and domain expiration errors",
        "type": "boolean"
      },
      {
        "flag": "ssl-expiration-reminder",
        "path": "sslExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the SSL certificate is about to expire",
        "type": "boolean"
      },
      {
        "flag": "domain-expiration-reminder",
        "path": "domainExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the domain is about to expire",
        "type": "boolean"
      },
      {
        "aliases": [
          "follow-redirections"
        ],
        "flag": "follow-redirects",
        "path": "followRedirections",
        "required": false,
        "description": "Whether to follow redirections",
        "type": "boolean"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "URL of the monitor",
        "example": "https://example.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": true,
        "description": "Timeout of check in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "description": "Optional HTTP monitor configuration: ipVersion, sslExpirationPeriodDays, applicationErrorRetries",
        "properties": {
          "sslExpirationPeriodDays": {
            "description": "SSL expiration period in days (0-365, max 10 items)",
            "example": [
              7,
              14,
              30
            ],
            "items": {
              "maximum": 365,
              "minimum": 0,
              "type": "number"
            },
            "maxItems": 10,
            "type": "array"
          },
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "type": "string"
          },
          "applicationErrorRetries": {
            "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting.",
            "example": 1,
            "maximum": 3,
            "minimum": 0,
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-ssl-expiration-period-days",
        "path": "config.sslExpirationPeriodDays",
        "required": false,
        "description": "SSL expiration period in days (0-365, max 10 items)",
        "example": [
          7,
          14,
          30
        ],
        "items": {
          "maximum": 365,
          "minimum": 0,
          "type": "number"
        },
        "maxItems": 10,
        "type": "array"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "type": "string"
      },
      {
        "flag": "config-application-error-retries",
        "path": "config.applicationErrorRetries",
        "required": false,
        "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting.",
        "example": 1,
        "maximum": 3,
        "minimum": 0,
        "type": "number"
      }
    ]
  },
  "monitors:create:keyword": {
    "commandId": "monitors:create:keyword",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (KEYWORD)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "KEYWORD"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My Keyword monitor",
          "type": "KEYWORD",
          "url": "https://example.com",
          "interval": 60,
          "timeout": 30,
          "keywordType": "ALERT_EXISTS",
          "keywordCaseType": "CaseSensitive",
          "keywordValue": "Service Unavailable"
        },
        "name": "Keyword Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "aliases": [
          "http-method-type"
        ],
        "flag": "method",
        "path": "httpMethodType",
        "required": false,
        "description": "HTTP method to use for the request. For HTTP and Keyword monitors it defaults to HEAD if omitted",
        "enum": [
          "HEAD",
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
          "QUERY"
        ],
        "example": "HEAD",
        "type": "string"
      },
      {
        "flag": "auth-type",
        "path": "authType",
        "required": false,
        "description": "Authentication method to use for the request",
        "enum": [
          "NONE",
          "HTTP_BASIC",
          "DIGEST",
          "BEARER"
        ],
        "example": "NONE",
        "type": "string"
      },
      {
        "flag": "http-username",
        "path": "httpUsername",
        "required": false,
        "description": "Username for HTTP Basic authentication",
        "example": "admin",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "http-password",
        "path": "httpPassword",
        "required": false,
        "description": "Password for HTTP Basic authentication",
        "example": "password",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "post-value-data",
        "path": "postValueData",
        "required": false,
        "description": "Data to be sent in the request. Not applicable for HTTP method type = HEAD. Can be a JSON object or string",
        "type": "json"
      },
      {
        "flag": "post-value-type",
        "path": "postValueType",
        "required": false,
        "description": "Type of data payload to be sent in the request. Affects what data is accepted by \"postValueData\" field",
        "enum": [
          "KEY_VALUE",
          "RAW_JSON"
        ],
        "example": "RAW_JSON",
        "type": "string"
      },
      {
        "flag": "custom-http-headers",
        "path": "customHttpHeaders",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom HTTP headers to be sent in the request. Must be sent as JSON object with key-value pairs. The serialized JSON must not exceed 3000 characters",
        "example": {
          "X-Custom-Header": "value"
        },
        "type": "object"
      },
      {
        "flag": "success-http-response-codes",
        "path": "successHttpResponseCodes",
        "required": false,
        "description": "Success HTTP response codes. Can contain specific codes or ranges like 2xx. Default is [2xx, 3xx]",
        "example": [
          "2xx",
          "3xx"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "aliases": [
          "check-ssl-errors"
        ],
        "flag": "check-ssl",
        "path": "checkSSLErrors",
        "required": false,
        "description": "Whether to check for SSL and domain expiration errors",
        "type": "boolean"
      },
      {
        "flag": "ssl-expiration-reminder",
        "path": "sslExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the SSL certificate is about to expire",
        "type": "boolean"
      },
      {
        "flag": "domain-expiration-reminder",
        "path": "domainExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the domain is about to expire",
        "type": "boolean"
      },
      {
        "aliases": [
          "follow-redirections"
        ],
        "flag": "follow-redirects",
        "path": "followRedirections",
        "required": false,
        "description": "Whether to follow redirections",
        "type": "boolean"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "URL of the monitor",
        "example": "https://example.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": true,
        "description": "Timeout of check in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "keyword-type",
        "path": "keywordType",
        "required": true,
        "description": "Whether to alert when the keyword exists or when it does not exist",
        "enum": [
          "ALERT_EXISTS",
          "ALERT_NOT_EXISTS"
        ],
        "example": "ALERT_EXISTS",
        "type": "string"
      },
      {
        "flag": "keyword-case-type",
        "path": "keywordCaseType",
        "required": true,
        "description": "Whether the keyword match is case sensitive",
        "enum": [
          "CaseSensitive",
          "CaseInsensitive"
        ],
        "example": "CaseSensitive",
        "type": "string"
      },
      {
        "flag": "keyword-value",
        "path": "keywordValue",
        "required": true,
        "description": "Keyword to search for in the response body. Surrounding whitespace is trimmed",
        "example": "Welcome",
        "maxLength": 500,
        "type": "string"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "description": "Optional Keyword monitor configuration: ipVersion, sslExpirationPeriodDays, applicationErrorRetries",
        "properties": {
          "sslExpirationPeriodDays": {
            "description": "SSL expiration period in days (0-365, max 10 items)",
            "example": [
              7,
              14,
              30
            ],
            "items": {
              "maximum": 365,
              "minimum": 0,
              "type": "number"
            },
            "maxItems": 10,
            "type": "array"
          },
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "type": "string"
          },
          "applicationErrorRetries": {
            "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting.",
            "example": 1,
            "maximum": 3,
            "minimum": 0,
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-ssl-expiration-period-days",
        "path": "config.sslExpirationPeriodDays",
        "required": false,
        "description": "SSL expiration period in days (0-365, max 10 items)",
        "example": [
          7,
          14,
          30
        ],
        "items": {
          "maximum": 365,
          "minimum": 0,
          "type": "number"
        },
        "maxItems": 10,
        "type": "array"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "type": "string"
      },
      {
        "flag": "config-application-error-retries",
        "path": "config.applicationErrorRetries",
        "required": false,
        "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting.",
        "example": 1,
        "maximum": 3,
        "minimum": 0,
        "type": "number"
      }
    ]
  },
  "monitors:create:ping": {
    "commandId": "monitors:create:ping",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (PING)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "PING"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My Ping monitor",
          "type": "PING",
          "url": "example.com",
          "interval": 60,
          "timeout": 30
        },
        "name": "Ping Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "Hostname or IP address to ping. A protocol prefix is stripped if provided",
        "example": "example.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": true,
        "description": "Timeout of check in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "description": "Optional Ping monitor configuration: ipVersion",
        "properties": {
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "type": "string"
      }
    ]
  },
  "monitors:create:port": {
    "commandId": "monitors:create:port",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (PORT)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "PORT"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My Port monitor",
          "type": "PORT",
          "url": "example.com",
          "port": 443,
          "interval": 60,
          "timeout": 30
        },
        "name": "Port Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "Hostname or IP address to check. A protocol prefix is stripped if provided",
        "example": "example.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "port",
        "path": "port",
        "required": true,
        "description": "Port to check",
        "example": 443,
        "maximum": 65535,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": true,
        "description": "Timeout of check in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "description": "Optional Port monitor configuration: ipVersion",
        "properties": {
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "type": "string"
      }
    ]
  },
  "monitors:create:third-party-service": {
    "commandId": "monitors:create:third-party-service",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (THIRD_PARTY_SERVICE)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "THIRD_PARTY_SERVICE"
    },
    "requestBodyExamples": [
      {
        "body": {
          "type": "THIRD_PARTY_SERVICE",
          "config": {
            "thirdPartyService": {
              "providerId": 4317
            }
          }
        },
        "name": "Third Party Service"
      }
    ],
    "requestBodyFields": [
      {
        "flag": "config",
        "path": "config",
        "required": true,
        "description": "Third party service configuration. `config.thirdPartyService.providerId` (required) names the isdown provider to track; `trackedComponentIds` optionally scopes tracking to specific components; `notify` tunes notifications.",
        "properties": {
          "thirdPartyService": {
            "description": "Third party service configuration: the isdown provider to track and, optionally, which of its components to scope tracking to.",
            "properties": {
              "providerId": {
                "description": "The provider to track: isdown's numeric provider id, as returned by the third-party provider catalog.",
                "example": 4317,
                "maximum": 9007199254740991,
                "minimum": 1,
                "type": "number"
              },
              "trackedComponentIds": {
                "description": "Component ids to scope tracking to (isdown components.id, not external_id). Omit to track every component.",
                "example": [
                  555,
                  556
                ],
                "items": {
                  "type": "number"
                },
                "nullable": true,
                "type": "array"
              },
              "notify": {
                "description": "Notification tuning. Omit to use the defaults.",
                "properties": {
                  "severity": {
                    "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
                    "enum": [
                      "all",
                      "major",
                      "none"
                    ],
                    "example": "major",
                    "type": "string"
                  },
                  "incrementalUpdates": {
                    "description": "Also notify on incremental updates of an incident already notified.",
                    "example": true,
                    "type": "boolean"
                  }
                },
                "requiredProperties": [
                  "severity",
                  "incrementalUpdates"
                ],
                "type": "object"
              }
            },
            "requiredProperties": [
              "providerId"
            ],
            "type": "object"
          }
        },
        "requiredProperties": [
          "thirdPartyService"
        ],
        "type": "object"
      },
      {
        "flag": "config-third-party-service",
        "path": "config.thirdPartyService",
        "required": true,
        "description": "Third party service configuration: the isdown provider to track and, optionally, which of its components to scope tracking to.",
        "properties": {
          "providerId": {
            "description": "The provider to track: isdown's numeric provider id, as returned by the third-party provider catalog.",
            "example": 4317,
            "maximum": 9007199254740991,
            "minimum": 1,
            "type": "number"
          },
          "trackedComponentIds": {
            "description": "Component ids to scope tracking to (isdown components.id, not external_id). Omit to track every component.",
            "example": [
              555,
              556
            ],
            "items": {
              "type": "number"
            },
            "nullable": true,
            "type": "array"
          },
          "notify": {
            "description": "Notification tuning. Omit to use the defaults.",
            "properties": {
              "severity": {
                "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
                "enum": [
                  "all",
                  "major",
                  "none"
                ],
                "example": "major",
                "type": "string"
              },
              "incrementalUpdates": {
                "description": "Also notify on incremental updates of an incident already notified.",
                "example": true,
                "type": "boolean"
              }
            },
            "requiredProperties": [
              "severity",
              "incrementalUpdates"
            ],
            "type": "object"
          }
        },
        "requiredProperties": [
          "providerId"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "config-third-party-service-provider-id"
        ],
        "flag": "provider-id",
        "path": "config.thirdPartyService.providerId",
        "required": true,
        "description": "The provider to track: isdown's numeric provider id, as returned by the third-party provider catalog.",
        "example": 4317,
        "maximum": 9007199254740991,
        "minimum": 1,
        "type": "number"
      },
      {
        "aliases": [
          "config-third-party-service-tracked-component-ids"
        ],
        "flag": "components",
        "path": "config.thirdPartyService.trackedComponentIds",
        "required": false,
        "description": "Component ids to scope tracking to (isdown components.id, not external_id). Omit to track every component.",
        "example": [
          555,
          556
        ],
        "items": {
          "type": "number"
        },
        "nullable": true,
        "type": "array"
      },
      {
        "flag": "config-third-party-service-notify",
        "path": "config.thirdPartyService.notify",
        "required": false,
        "description": "Notification tuning. Omit to use the defaults.",
        "properties": {
          "severity": {
            "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
            "enum": [
              "all",
              "major",
              "none"
            ],
            "example": "major",
            "type": "string"
          },
          "incrementalUpdates": {
            "description": "Also notify on incremental updates of an incident already notified.",
            "example": true,
            "type": "boolean"
          }
        },
        "requiredProperties": [
          "severity",
          "incrementalUpdates"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "config-third-party-service-notify-severity"
        ],
        "flag": "notify-severity",
        "path": "config.thirdPartyService.notify.severity",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
        "enum": [
          "all",
          "major",
          "none"
        ],
        "example": "major",
        "type": "string"
      },
      {
        "aliases": [
          "config-third-party-service-notify-incremental-updates"
        ],
        "flag": "notify-incremental-updates",
        "path": "config.thirdPartyService.notify.incrementalUpdates",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Also notify on incremental updates of an incident already notified.",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Omit to inherit the account default contact.",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      }
    ]
  },
  "monitors:create:udp": {
    "commandId": "monitors:create:udp",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (UDP)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "UDP"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My UDP monitor",
          "type": "UDP",
          "url": "1.2.3.4",
          "port": 53,
          "interval": 60,
          "timeout": 30,
          "config": {
            "udp": {
              "payload": "ping",
              "packetLossThreshold": 50
            }
          }
        },
        "name": "UDP Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "Hostname or IP address to check. A protocol prefix is stripped if provided",
        "example": "1.2.3.4",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "port",
        "path": "port",
        "required": true,
        "description": "Port to send the UDP packet to",
        "example": 53,
        "maximum": 65535,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": true,
        "description": "Timeout of check in seconds",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config",
        "path": "config",
        "required": true,
        "description": "UDP monitor configuration. `udp.packetLossThreshold` is required",
        "properties": {
          "udp": {
            "description": "UDP monitor configuration",
            "properties": {
              "payload": {
                "description": "UDP payload to send",
                "type": "string"
              },
              "packetLossThreshold": {
                "description": "Packet loss threshold percentage",
                "type": "number"
              }
            },
            "requiredProperties": [
              "packetLossThreshold"
            ],
            "type": "object"
          },
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-udp",
        "path": "config.udp",
        "required": false,
        "description": "UDP monitor configuration",
        "properties": {
          "payload": {
            "description": "UDP payload to send",
            "type": "string"
          },
          "packetLossThreshold": {
            "description": "Packet loss threshold percentage",
            "type": "number"
          }
        },
        "requiredProperties": [
          "packetLossThreshold"
        ],
        "type": "object"
      },
      {
        "flag": "config-udp-payload",
        "path": "config.udp.payload",
        "required": false,
        "description": "UDP payload to send",
        "type": "string"
      },
      {
        "flag": "config-udp-packet-loss-threshold",
        "path": "config.udp.packetLossThreshold",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Packet loss threshold percentage",
        "type": "number"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6)",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "type": "string"
      }
    ]
  },
  "monitors:create:visual-comparison": {
    "commandId": "monitors:create:visual-comparison",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint. The request body is documented as one schema per monitor type — pick the one matching the `type` you are creating.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor (VISUAL_COMPARISON)",
    "tags": [
      "Monitors"
    ],
    "requestBodyDefaults": {
      "type": "VISUAL_COMPARISON"
    },
    "requestBodyExamples": [
      {
        "body": {
          "friendlyName": "My Visual Comparison monitor",
          "type": "VISUAL_COMPARISON",
          "url": "https://example.com",
          "interval": 300,
          "config": {
            "visualComparison": {
              "sensitivityThreshold": 10,
              "viewport": "desktop"
            }
          }
        },
        "name": "Visual Comparison Monitor"
      }
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": true,
        "description": "Interval of check in seconds",
        "example": 60,
        "minimum": 30,
        "type": "number"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Default is 0 (no group).",
        "example": 0,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "additionalProperties": {
          "type": "string"
        },
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "url",
        "path": "url",
        "required": true,
        "description": "URL of the page to capture and compare",
        "example": "https://example.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "config",
        "path": "config",
        "required": true,
        "description": "Visual comparison configuration — sensitivity, viewport and optional area to compare",
        "properties": {
          "visualComparison": {
            "description": "Visual comparison monitor configuration",
            "properties": {
              "sensitivityThreshold": {
                "description": "Difference sensitivity threshold (0-100)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "viewport": {
                "description": "Viewport profile for the capture",
                "enum": [
                  "desktop",
                  "mobile"
                ],
                "type": "string"
              },
              "areaCoordinates": {
                "description": "Optional rectangular region (percentage-based) to compare. Omit for full-page comparison.",
                "properties": {
                  "percentX": {
                    "description": "Left edge (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  },
                  "percentY": {
                    "description": "Top edge (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  },
                  "percentWidth": {
                    "description": "Width (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  },
                  "percentHeight": {
                    "description": "Height (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  }
                },
                "requiredProperties": [
                  "percentX",
                  "percentY",
                  "percentWidth",
                  "percentHeight"
                ],
                "type": "object"
              }
            },
            "requiredProperties": [
              "sensitivityThreshold",
              "viewport"
            ],
            "type": "object"
          }
        },
        "requiredProperties": [
          "visualComparison"
        ],
        "type": "object"
      },
      {
        "flag": "config-visual-comparison",
        "path": "config.visualComparison",
        "required": true,
        "description": "Visual comparison monitor configuration",
        "properties": {
          "sensitivityThreshold": {
            "description": "Difference sensitivity threshold (0-100)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "viewport": {
            "description": "Viewport profile for the capture",
            "enum": [
              "desktop",
              "mobile"
            ],
            "type": "string"
          },
          "areaCoordinates": {
            "description": "Optional rectangular region (percentage-based) to compare. Omit for full-page comparison.",
            "properties": {
              "percentX": {
                "description": "Left edge (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "percentY": {
                "description": "Top edge (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "percentWidth": {
                "description": "Width (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "percentHeight": {
                "description": "Height (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              }
            },
            "requiredProperties": [
              "percentX",
              "percentY",
              "percentWidth",
              "percentHeight"
            ],
            "type": "object"
          }
        },
        "requiredProperties": [
          "sensitivityThreshold",
          "viewport"
        ],
        "type": "object"
      },
      {
        "flag": "config-visual-comparison-sensitivity-threshold",
        "path": "config.visualComparison.sensitivityThreshold",
        "required": true,
        "description": "Difference sensitivity threshold (0-100)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-viewport",
        "path": "config.visualComparison.viewport",
        "required": true,
        "description": "Viewport profile for the capture",
        "enum": [
          "desktop",
          "mobile"
        ],
        "type": "string"
      },
      {
        "flag": "config-visual-comparison-area-coordinates",
        "path": "config.visualComparison.areaCoordinates",
        "required": false,
        "description": "Optional rectangular region (percentage-based) to compare. Omit for full-page comparison.",
        "properties": {
          "percentX": {
            "description": "Left edge (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "percentY": {
            "description": "Top edge (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "percentWidth": {
            "description": "Width (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "percentHeight": {
            "description": "Height (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          }
        },
        "requiredProperties": [
          "percentX",
          "percentY",
          "percentWidth",
          "percentHeight"
        ],
        "type": "object"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-x",
        "path": "config.visualComparison.areaCoordinates.percentX",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Left edge (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-y",
        "path": "config.visualComparison.areaCoordinates.percentY",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Top edge (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-width",
        "path": "config.visualComparison.areaCoordinates.percentWidth",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Width (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-height",
        "path": "config.visualComparison.areaCoordinates.percentHeight",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Height (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      }
    ]
  },
  "monitors:delete": {
    "commandId": "monitors:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "destructive": true,
    "method": "DELETE",
    "operationId": "MonitorsController_delete",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}",
    "requestBodyRequired": false,
    "summary": "Delete a monitor",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:get": {
    "commandId": "monitors:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get a monitor details by ID",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_get",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}",
    "requestBodyRequired": false,
    "summary": "Get a monitor by ID",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:list": {
    "commandId": "monitors:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List all monitors in a user's account. Values can be paginated with the cursor parameter. Optionally filter by tags, URL, name, status, groupId, or limit. All filters use AND logic when combined.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_list",
    "parameters": [
      {
        "description": "Filter monitors by custom field key:value pairs. Format: customField=key:value. Multiple filters use AND logic. Split on first colon only.",
        "example": "environment:production",
        "in": "query",
        "itemType": "string",
        "name": "customField",
        "required": false,
        "type": "array"
      },
      {
        "description": "Maximum number of monitors to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Filter monitors by monitor group ID.",
        "example": 100,
        "in": "query",
        "name": "groupId",
        "required": false,
        "type": "number"
      },
      {
        "description": "Comma-separated list of status values to filter monitors. Uses OR logic (matches any specified status). Case-insensitive. Allowed values: PAUSED, STARTED, UP, LOOKS_DOWN, DOWN.",
        "example": "UP,DOWN",
        "in": "query",
        "name": "status",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter monitors by name. Case-insensitive partial match on the monitor friendly name.",
        "example": "Production API",
        "in": "query",
        "name": "name",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter monitors by URL. Case-insensitive partial match on the monitor URL.",
        "example": "example.com",
        "in": "query",
        "name": "url",
        "required": false,
        "type": "string"
      },
      {
        "description": "Comma-separated list of tag names to filter monitors. Uses OR logic (matches any specified tag). Case-sensitive.",
        "example": "production,staging",
        "in": "query",
        "name": "tags",
        "required": false,
        "type": "string"
      },
      {
        "description": "Cursor to paginate through monitors",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/monitors",
    "requestBodyRequired": false,
    "summary": "List monitors",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:pause": {
    "commandId": "monitors:pause",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Pauses a single monitor by ID. The monitor will stop being checked until it is resumed. This operation is idempotent - pausing an already paused monitor will return successfully.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_pause",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}/pause",
    "requestBodyRequired": false,
    "summary": "Pause a monitor",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:reset": {
    "commandId": "monitors:reset",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Resets stats for a monitor. This includes the stats for incidents and alerts.",
    "destructive": true,
    "method": "POST",
    "operationId": "MonitorsController_reset",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}/reset",
    "requestBodyRequired": false,
    "summary": "Reset stats for a monitor",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:start": {
    "commandId": "monitors:start",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Starts a paused monitor by ID. The monitor will resume being checked. This operation is idempotent - starting an already active monitor will return successfully.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_start",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}/start",
    "requestBodyRequired": false,
    "summary": "Start a monitor",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:stats:response-time": {
    "commandId": "monitors:stats:response-time",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns response time statistics for a specific monitor within a configurable date range. Defaults to the last 24 hours. Maximum range is 90 days. Optionally includes time series data. Optionally filter by region.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getMonitorResponseTimeStats",
    "parameters": [
      {
        "description": "The monitor ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      },
      {
        "description": "Start date for statistics (ISO 8601 format). Defaults to 24 hours ago.",
        "example": "2025-01-01T00:00:00Z",
        "in": "query",
        "name": "from",
        "required": false,
        "type": "string"
      },
      {
        "description": "End date for statistics (ISO 8601 format). Defaults to now.",
        "example": "2025-01-07T00:00:00Z",
        "in": "query",
        "name": "to",
        "required": false,
        "type": "string"
      },
      {
        "description": "Whether to include time series data points in the response. Defaults to false.",
        "example": true,
        "in": "query",
        "name": "includeTimeSeries",
        "required": false,
        "type": "boolean"
      },
      {
        "description": "Filter by region code (na, eu, as, oc). When provided, only returns data for the specified region.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc",
          "all"
        ],
        "example": "na",
        "in": "query",
        "name": "region",
        "required": false,
        "type": "string"
      }
    ],
    "path": "/monitors/{id}/stats/response-time",
    "requestBodyRequired": false,
    "summary": "Get monitor response time statistics",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:stats:response-time:all": {
    "commandId": "monitors:stats:response-time:all",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns response time statistics for a specific monitor grouped by region within a configurable date range. Defaults to the last 24 hours. Maximum range is 90 days. Optionally includes time series data.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getMonitorResponseTimeStatsByRegion",
    "parameters": [
      {
        "description": "The monitor ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      },
      {
        "description": "Start date for statistics (ISO 8601 format). Defaults to 24 hours ago.",
        "example": "2025-01-01T00:00:00Z",
        "in": "query",
        "name": "from",
        "required": false,
        "type": "string"
      },
      {
        "description": "End date for statistics (ISO 8601 format). Defaults to now.",
        "example": "2025-01-07T00:00:00Z",
        "in": "query",
        "name": "to",
        "required": false,
        "type": "string"
      },
      {
        "description": "Whether to include time series data points in the response. Defaults to false.",
        "example": true,
        "in": "query",
        "name": "includeTimeSeries",
        "required": false,
        "type": "boolean"
      }
    ],
    "path": "/monitors/{id}/stats/response-time/all",
    "requestBodyRequired": false,
    "summary": "Get monitor response time statistics by region",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:stats:uptime": {
    "commandId": "monitors:stats:uptime",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns uptime statistics for a specific monitor within a configurable date range. Defaults to the last 24 hours. Maximum range is 90 days.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getMonitorUptimeStats",
    "parameters": [
      {
        "description": "The monitor ID",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      },
      {
        "description": "Start date for statistics (ISO 8601 format). Defaults to 24 hours ago.",
        "example": "2025-01-01T00:00:00Z",
        "in": "query",
        "name": "from",
        "required": false,
        "type": "string"
      },
      {
        "description": "End date for statistics (ISO 8601 format). Defaults to now.",
        "example": "2025-01-07T00:00:00Z",
        "in": "query",
        "name": "to",
        "required": false,
        "type": "string"
      }
    ],
    "path": "/monitors/{id}/stats/uptime",
    "requestBodyRequired": false,
    "summary": "Get monitor uptime statistics",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:storm-protection": {
    "commandId": "monitors:storm-protection",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get the account-wide storm protection (alert grouping) settings. Returns defaults when not yet configured.",
    "destructive": false,
    "method": "GET",
    "operationId": "StormProtectionController_get",
    "parameters": [],
    "path": "/monitors/storm-protection",
    "requestBodyRequired": false,
    "summary": "Get storm protection settings",
    "tags": [
      "Storm Protection"
    ]
  },
  "monitors:storm-protection:update": {
    "commandId": "monitors:storm-protection:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update the account-wide storm protection (alert grouping) settings. Partial update — only provided fields are changed.",
    "destructive": false,
    "method": "PATCH",
    "operationId": "StormProtectionController_update",
    "parameters": [],
    "path": "/monitors/storm-protection",
    "requestBodyRequired": true,
    "summary": "Update storm protection settings",
    "tags": [
      "Storm Protection"
    ],
    "requestBodyFields": [
      {
        "flag": "is-enabled",
        "path": "isEnabled",
        "required": false,
        "description": "Enable or disable storm protection (alert grouping).",
        "type": "boolean"
      },
      {
        "flag": "threshold-type",
        "path": "thresholdType",
        "required": false,
        "description": "How the threshold is measured.",
        "enum": [
          "count",
          "percentage"
        ],
        "type": "string"
      },
      {
        "flag": "threshold-value",
        "path": "thresholdValue",
        "required": false,
        "description": "Threshold that triggers grouping. Accepts 1-1000000; the stricter rule (>= 2 for \"count\", <= 100 for \"percentage\") is enforced server-side by domain validation.",
        "maximum": 1000000,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "window-minutes",
        "path": "windowMinutes",
        "required": false,
        "description": "Rolling time window in minutes (1-15).",
        "maximum": 15,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "properties": {
          "groupPooling": {
            "description": "When enabled, suppressed alerts are pooled into a single grouped notification.",
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-group-pooling",
        "path": "config.groupPooling",
        "required": false,
        "description": "When enabled, suppressed alerts are pooled into a single grouped notification.",
        "type": "boolean"
      }
    ]
  },
  "monitors:third-party-service:incidents:activity-log": {
    "commandId": "monitors:third-party-service:incidents:activity-log",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns the notifications this account sent about one incident of a third party service, with the channel, the alert contact and whether delivery succeeded. channelIdentifier is shown only for email, SMS and voice channels; for every other channel, such as webhooks, Slack or mobile push, whose value can carry a credential, it is the literal string \"[REDACTED]\". An incident with no notifications returns an empty array with a 200.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getThirdPartyServiceIncidentActivityLog",
    "parameters": [
      {
        "description": "The monitor ID",
        "example": 42,
        "in": "path",
        "maximum": 2147483647,
        "minimum": 1,
        "name": "id",
        "required": true,
        "type": "number"
      },
      {
        "description": "The incident ID from the incident history of the third party service. A string, since it can exceed the safe integer range.",
        "example": "355758443503112192",
        "in": "path",
        "name": "incidentId",
        "required": true,
        "type": "string"
      }
    ],
    "path": "/monitors/{id}/third-party-service/incidents/{incidentId}/activity-log",
    "requestBodyRequired": false,
    "summary": "Get the activity log of a third party service incident",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:third-party-service:incidents:get": {
    "commandId": "monitors:third-party-service:incidents:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns one incident from the incident history of a third party service monitor, resolved or not, with its verbatim provider updates. affectedComponents lists the affected components the monitor tracks, or every affected component when the monitor tracks the whole provider.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getThirdPartyServiceIncident",
    "parameters": [
      {
        "description": "The monitor ID",
        "example": 42,
        "in": "path",
        "maximum": 2147483647,
        "minimum": 1,
        "name": "id",
        "required": true,
        "type": "number"
      },
      {
        "description": "The incident ID from the incident history of the third party service. A string, since it can exceed the safe integer range.",
        "example": "355758443503112192",
        "in": "path",
        "name": "incidentId",
        "required": true,
        "type": "string"
      }
    ],
    "path": "/monitors/{id}/third-party-service/incidents/{incidentId}",
    "requestBodyRequired": false,
    "summary": "Get one incident of a third party service",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:third-party-service:incidents:list": {
    "commandId": "monitors:third-party-service:incidents:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns every incident (resolved and unresolved) recorded for the provider a third party service monitor tracks, newest first, with verbatim provider updates. An empty history returns an empty array with a 200, never an error.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getThirdPartyServiceIncidents",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}/third-party-service/incidents",
    "requestBodyRequired": false,
    "summary": "Get the incident history of a third party service",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:third-party-service:status": {
    "commandId": "monitors:third-party-service:status",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns the fine-grained 4-state (operational, minor, major, maintenance) for a third party service monitor. Distinct from the coarse monitor status field, which cannot tell a partial degradation from a full outage.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getThirdPartyServiceStatus",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}/third-party-service/status",
    "requestBodyRequired": false,
    "summary": "Get the current status of a third party service",
    "tags": [
      "Monitors"
    ]
  },
  "monitors:update": {
    "commandId": "monitors:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "destructive": false,
    "method": "PATCH",
    "operationId": "MonitorsController_update",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/monitors/{id}",
    "requestBodyRequired": true,
    "summary": "Update a monitor",
    "tags": [
      "Monitors"
    ],
    "requestBodyFields": [
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": false,
        "description": "Friendly name of the monitor",
        "example": "My monitor",
        "maxLength": 250,
        "type": "string"
      },
      {
        "flag": "url",
        "path": "url",
        "required": false,
        "description": "URL of the monitor. For DNS monitors: DNS server IP or hostname. Not required for Heartbeat monitor",
        "example": "http://test.com",
        "maxLength": 10000,
        "type": "string"
      },
      {
        "flag": "type",
        "path": "type",
        "required": false,
        "enum": [
          "HTTP",
          "KEYWORD",
          "PING",
          "PORT",
          "HEARTBEAT",
          "DNS",
          "API",
          "UDP",
          "VISUAL_COMPARISON",
          "THIRD_PARTY_SERVICE"
        ],
        "example": "HTTP",
        "type": "string"
      },
      {
        "flag": "port",
        "path": "port",
        "required": false,
        "description": "Required for Port and UDP monitors",
        "maximum": 65535,
        "minimum": 1,
        "type": "number"
      },
      {
        "flag": "port-alert-condition",
        "path": "portAlertCondition",
        "required": false,
        "description": "Alerting condition for Port monitors. Only valid when type is Port; defaults to CLOSED when omitted.",
        "enum": [
          "CLOSED",
          "OPEN"
        ],
        "example": "CLOSED",
        "type": "string"
      },
      {
        "flag": "keyword-type",
        "path": "keywordType",
        "required": false,
        "description": "Required for Keyword monitor",
        "enum": [
          "ALERT_EXISTS",
          "ALERT_NOT_EXISTS"
        ],
        "example": "ALERT_EXISTS",
        "type": "string"
      },
      {
        "flag": "keyword-case-type",
        "path": "keywordCaseType",
        "required": false,
        "description": "Required for Keyword monitor",
        "enum": [
          0,
          1
        ],
        "type": "number"
      },
      {
        "flag": "keyword-value",
        "path": "keywordValue",
        "required": false,
        "description": "Required for Keyword monitor",
        "maxLength": 500,
        "nullable": true,
        "type": "string"
      },
      {
        "flag": "interval",
        "path": "interval",
        "required": false,
        "description": "Interval of check in seconds. Heartbeat monitors support at most 2678400 seconds (31 days).",
        "example": 60,
        "minimum": 15,
        "type": "number"
      },
      {
        "flag": "timeout",
        "path": "timeout",
        "required": false,
        "description": "Timeout of check in seconds. Only for Http, Keyword and Port monitors",
        "example": 30,
        "maximum": 60,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "grace-period",
        "path": "gracePeriod",
        "required": false,
        "description": "Grace period of check in seconds. Only for Heartbeat monitor",
        "example": 300,
        "maximum": 86400,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "http-username",
        "path": "httpUsername",
        "required": false,
        "description": "Username for HTTP Basic authentication",
        "example": "admin",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "http-password",
        "path": "httpPassword",
        "required": false,
        "description": "Password for HTTP Basic authentication",
        "example": "password",
        "maxLength": 255,
        "type": "string"
      },
      {
        "aliases": [
          "http-method-type"
        ],
        "flag": "method",
        "path": "httpMethodType",
        "required": false,
        "description": "HTTP method to use for the request. For HTTP and Keyword monitors it defaults to HEAD if omitted; API monitors default to GET and do not allow HEAD",
        "enum": [
          "HEAD",
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "OPTIONS",
          "QUERY"
        ],
        "example": "HEAD",
        "nullable": true,
        "type": "string"
      },
      {
        "flag": "auth-type",
        "path": "authType",
        "required": false,
        "description": "Authentication method to use for the request. Only applicable for HTTP and Keyword monitors",
        "enum": [
          "NONE",
          "HTTP_BASIC",
          "DIGEST",
          "BEARER"
        ],
        "example": "NONE",
        "type": "string"
      },
      {
        "flag": "post-value-data",
        "path": "postValueData",
        "required": false,
        "description": "Data to be sent in the request. Not applicable for HTTP method type = HEAD. Can be JSON string or string",
        "type": "object"
      },
      {
        "flag": "post-value-type",
        "path": "postValueType",
        "required": false,
        "description": "Type of data payload to be sent in the request. Affects what data is accepted by \"postValueData\" field",
        "enum": [
          "KEY_VALUE",
          "RAW_JSON"
        ],
        "type": "string"
      },
      {
        "flag": "assigned-alert-contacts",
        "path": "assignedAlertContacts",
        "required": false,
        "description": "Alert contacts to be assigned to the monitor. Threshold and recurrence are only available in the paid plans, they are always 0 in the Free Plan",
        "items": {
          "properties": {
            "alertContactId": {
              "description": "ID of the alert contact to notify",
              "example": 12345,
              "type": "number"
            },
            "threshold": {
              "description": "Delay of notification in minutes, after the monitor is down",
              "example": 5,
              "type": "number"
            },
            "recurrence": {
              "description": "Repeat notifications every X minutes",
              "example": 30,
              "type": "number"
            }
          },
          "requiredProperties": [
            "alertContactId",
            "threshold",
            "recurrence"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "custom-http-headers",
        "path": "customHttpHeaders",
        "required": false,
        "description": "Custom HTTP headers to be sent in the request. Must be sent as JSON object with key-value pairs. The serialized JSON must not exceed 3000 characters",
        "type": "object"
      },
      {
        "flag": "success-http-response-codes",
        "path": "successHttpResponseCodes",
        "required": false,
        "default": [],
        "description": "Success HTTP response codes. Can contain specific codes or ranges like 2xx. Default is [2xx, 3xx]",
        "example": [
          "2xx",
          "3xx"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "aliases": [
          "check-ssl-errors"
        ],
        "flag": "check-ssl",
        "path": "checkSSLErrors",
        "required": false,
        "description": "Whether to check for SSL and domain expiration errors",
        "type": "boolean"
      },
      {
        "flag": "tag-names",
        "path": "tagNames",
        "required": false,
        "description": "Tags to be assigned to the monitor",
        "example": [
          "tag1",
          "tag2"
        ],
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "maintenance-windows-ids",
        "path": "maintenanceWindowsIds",
        "required": false,
        "description": "Maintenance windows to be assigned to the monitor",
        "example": [
          123,
          234
        ],
        "items": {
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "domain-expiration-reminder",
        "path": "domainExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the domain is about to expire",
        "type": "boolean"
      },
      {
        "flag": "ssl-expiration-reminder",
        "path": "sslExpirationReminder",
        "required": false,
        "description": "Whether to send a notification when the SSL certificate is about to expire",
        "type": "boolean"
      },
      {
        "aliases": [
          "follow-redirections"
        ],
        "flag": "follow-redirects",
        "path": "followRedirections",
        "required": false,
        "description": "Whether to follow redirections",
        "type": "boolean"
      },
      {
        "flag": "response-time-threshold",
        "path": "responseTimeThreshold",
        "required": false,
        "description": "Response time threshold in milliseconds. When provided, the value is applied to all active regions as regionData.THRESHOLD. Always returns 0 — use regionData.THRESHOLD for per-region control.",
        "maximum": 60000,
        "minimum": 0,
        "type": "number"
      },
      {
        "deprecated": true,
        "flag": "regional-data",
        "hidden": true,
        "path": "regionalData",
        "required": false,
        "description": "Region for monitoring: na (North America), eu (Europe), as (Asia), oc (Oceania). Note: If both regionalData and regionData are provided, regionData takes priority.",
        "enum": [
          "na",
          "eu",
          "as",
          "oc"
        ],
        "example": "na",
        "type": "string"
      },
      {
        "aliases": [
          "region-data"
        ],
        "flag": "region-config",
        "path": "regionData",
        "required": false,
        "description": "Advanced regional configuration as JSON; use --region for normal selection",
        "properties": {
          "REGION": {
            "items": {
              "enum": [
                "na",
                "eu",
                "as",
                "oc"
              ],
              "type": "string"
            },
            "minItems": 1,
            "type": "array"
          },
          "MANUAL_SELECTED": {
            "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
            "type": "boolean"
          },
          "THRESHOLD": {
            "additionalProperties": false,
            "description": "Regional threshold values in milliseconds mapped by region code",
            "example": {
              "na": 5000,
              "eu": 6000,
              "as": 7000,
              "oc": 8000
            },
            "properties": {
              "na": {
                "type": "number"
              },
              "eu": {
                "type": "number"
              },
              "as": {
                "type": "number"
              },
              "oc": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "requiredProperties": [
          "REGION"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "region-data-region"
        ],
        "flag": "region",
        "path": "regionData.REGION",
        "required": false,
        "requiredWhenParentPresent": true,
        "items": {
          "enum": [
            "na",
            "eu",
            "as",
            "oc"
          ],
          "type": "string"
        },
        "minItems": 1,
        "type": "array",
        "description": "Checker region code (repeatable)"
      },
      {
        "aliases": [
          "region-data-manual-selected"
        ],
        "flag": "region-manual-selected",
        "path": "regionData.MANUAL_SELECTED",
        "required": false,
        "description": "Whether the customer chose REGION explicitly. On update, false means the region was not customer-chosen, so REGION is ignored and the monitor keeps the region it already runs from. Send true to change the region, or omit this field.",
        "type": "boolean"
      },
      {
        "aliases": [
          "region-data-threshold"
        ],
        "flag": "region-thresholds",
        "path": "regionData.THRESHOLD",
        "required": false,
        "additionalProperties": false,
        "description": "Regional threshold values in milliseconds mapped by region code",
        "example": {
          "na": 5000,
          "eu": 6000,
          "as": 7000,
          "oc": 8000
        },
        "properties": {
          "na": {
            "type": "number"
          },
          "eu": {
            "type": "number"
          },
          "as": {
            "type": "number"
          },
          "oc": {
            "type": "number"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "region-data-threshold-na"
        ],
        "flag": "region-threshold-na",
        "path": "regionData.THRESHOLD.na",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-eu"
        ],
        "flag": "region-threshold-eu",
        "path": "regionData.THRESHOLD.eu",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-as"
        ],
        "flag": "region-threshold-as",
        "path": "regionData.THRESHOLD.as",
        "required": false,
        "type": "number"
      },
      {
        "aliases": [
          "region-data-threshold-oc"
        ],
        "flag": "region-threshold-oc",
        "path": "regionData.THRESHOLD.oc",
        "required": false,
        "type": "number"
      },
      {
        "flag": "group-id",
        "path": "groupId",
        "required": false,
        "description": "Monitor group ID to assign the monitor to. Use 0 for the default group.",
        "example": 10,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "custom-fields",
        "path": "customFields",
        "required": false,
        "description": "Custom key-value metadata for the monitor. Max 20 keys. Keys: alphanumeric + underscore + hyphen, max 64 chars. Values: max 255 chars. Paid plans only.",
        "example": {
          "environment": "production",
          "team": "platform"
        },
        "type": "object"
      },
      {
        "flag": "config",
        "path": "config",
        "required": false,
        "description": "Monitor configuration patch. Accepted keys depend on the monitor type - HTTP/Keyword: sslExpirationPeriodDays, ipVersion, applicationErrorRetries. API: apiAssertions, sslExpirationPeriodDays, ipVersion, applicationErrorRetries. DNS: dnsRecords. UDP: udp, ipVersion. PING/PORT: ipVersion. Visual Comparison: visualComparison. Third party service: thirdPartyService. Heartbeat: none. Top-level shallow merge with existing config: omit keys to leave unchanged, set a key to null to remove it, or send `config: null` to clear all config.",
        "nullable": true,
        "properties": {
          "dnsRecords": {
            "description": "DNS records configuration. DNS monitors only. Send null to remove.",
            "nullable": true,
            "properties": {
              "CNAME": {
                "description": "CNAME DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "MX": {
                "description": "MX DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "NS": {
                "description": "NS DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "A": {
                "description": "A DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "AAAA": {
                "description": "AAAA DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "TXT": {
                "description": "TXT DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "SRV": {
                "description": "SRV DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "PTR": {
                "description": "PTR DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "SOA": {
                "description": "SOA DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "SPF": {
                "description": "SPF DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "DNSKEY": {
                "description": "DNSKEY DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "DS": {
                "description": "DS DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "NSEC": {
                "description": "NSEC DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              },
              "NSEC3": {
                "description": "NSEC3 DNS records",
                "items": {
                  "type": "string"
                },
                "type": "array"
              }
            },
            "type": "object"
          },
          "sslExpirationPeriodDays": {
            "description": "Days before certificate expiry to send SSL expiration reminders (0-365, max 10 items). Requires the top-level `sslExpirationReminder` flag to be enabled. HTTP, Keyword and API monitors only. Send null to remove.",
            "example": [
              7,
              14,
              30
            ],
            "items": {
              "maximum": 365,
              "minimum": 0,
              "type": "number"
            },
            "maxItems": 10,
            "nullable": true,
            "type": "array"
          },
          "apiAssertions": {
            "description": "API monitor assertions configuration. Required for API monitors — the merged config must still contain it. Send null to remove.",
            "nullable": true,
            "properties": {
              "logic": {
                "description": "Logic for combining assertions",
                "enum": [
                  "AND",
                  "OR"
                ],
                "example": "AND",
                "type": "string"
              },
              "checks": {
                "description": "Array of assertion checks (1-5)",
                "items": {
                  "properties": {
                    "property": {
                      "description": "Assertion source: safe JSONPath, headers.<name>, status_code, or body",
                      "example": "$.data.status",
                      "maxLength": 500,
                      "type": "string"
                    },
                    "comparison": {
                      "description": "Comparison operator",
                      "enum": [
                        "equals",
                        "not_equals",
                        "contains",
                        "not_contains",
                        "greater_than",
                        "less_than",
                        "is_null",
                        "is_not_null",
                        "is_string",
                        "is_number",
                        "is_boolean",
                        "is_array",
                        "is_object",
                        "is_empty",
                        "is_not_empty",
                        "length_equals",
                        "length_not_equals",
                        "length_greater_than",
                        "length_less_than",
                        "exists",
                        "not_exists"
                      ],
                      "example": "equals",
                      "type": "string"
                    },
                    "target": {
                      "description": "Expected native JSON value. Arrays and objects are supported for body-JSON equality and containment; omit target for null, type, existence, and empty comparisons.",
                      "example": [
                        "active",
                        {
                          "role": "primary"
                        }
                      ],
                      "type": "json"
                    }
                  },
                  "requiredProperties": [
                    "property",
                    "comparison"
                  ],
                  "type": "object"
                },
                "type": "array"
              }
            },
            "requiredProperties": [
              "logic",
              "checks"
            ],
            "type": "object"
          },
          "udp": {
            "description": "UDP monitor configuration. UDP monitors only. Send null to remove.",
            "nullable": true,
            "properties": {
              "payload": {
                "description": "UDP payload to send",
                "type": "string"
              },
              "packetLossThreshold": {
                "description": "Packet loss threshold percentage",
                "type": "number"
              }
            },
            "requiredProperties": [
              "packetLossThreshold"
            ],
            "type": "object"
          },
          "ipVersion": {
            "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6). Not supported by DNS, Heartbeat, Visual Comparison or third-party service monitors. Send null to remove.",
            "enum": [
              "ipv4Only",
              "ipv6Only"
            ],
            "example": "ipv4Only",
            "nullable": true,
            "type": "string"
          },
          "applicationErrorRetries": {
            "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting. HTTP, Keyword and API monitors only. Send null to remove.",
            "example": 1,
            "maximum": 3,
            "minimum": 0,
            "nullable": true,
            "type": "number"
          },
          "visualComparison": {
            "description": "Visual comparison configuration. Visual Comparison monitors only. Send null to remove.",
            "nullable": true,
            "properties": {
              "sensitivityThreshold": {
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "viewport": {
                "enum": [
                  "desktop",
                  "mobile"
                ],
                "type": "string"
              },
              "areaCoordinates": {
                "properties": {
                  "percentX": {
                    "description": "Left edge (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  },
                  "percentY": {
                    "description": "Top edge (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  },
                  "percentWidth": {
                    "description": "Width (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  },
                  "percentHeight": {
                    "description": "Height (percent)",
                    "maximum": 100,
                    "minimum": 0,
                    "type": "number"
                  }
                },
                "requiredProperties": [
                  "percentX",
                  "percentY",
                  "percentWidth",
                  "percentHeight"
                ],
                "type": "object"
              }
            },
            "type": "object"
          },
          "thirdPartyService": {
            "description": "Third party service configuration - the isdown provider to track and, optionally, which of its components to scope tracking to. Third party services only. Send null to remove.",
            "nullable": true,
            "properties": {
              "trackedComponentIds": {
                "description": "Component ids to scope tracking to (isdown components.id, not external_id). Every id must belong to the monitor provider. Omit to leave the scope unchanged, set to null or [] to track every component.",
                "example": [
                  555,
                  556
                ],
                "items": {
                  "type": "number"
                },
                "nullable": true,
                "type": "array"
              },
              "notify": {
                "description": "Notification tuning. Replaces the stored value as a whole. Omit to leave unchanged.",
                "properties": {
                  "severity": {
                    "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
                    "enum": [
                      "all",
                      "major",
                      "none"
                    ],
                    "example": "major",
                    "type": "string"
                  },
                  "incrementalUpdates": {
                    "description": "Also notify on incremental updates of an incident already notified.",
                    "example": true,
                    "type": "boolean"
                  }
                },
                "requiredProperties": [
                  "severity",
                  "incrementalUpdates"
                ],
                "type": "object"
              },
              "maintenanceNotificationsEnabled": {
                "description": "Notify when the provider schedules or updates a maintenance. Omit to leave unchanged.",
                "example": true,
                "type": "boolean"
              }
            },
            "type": "object"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-dns-records",
        "path": "config.dnsRecords",
        "required": false,
        "description": "DNS records configuration. DNS monitors only. Send null to remove.",
        "nullable": true,
        "properties": {
          "CNAME": {
            "description": "CNAME DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "MX": {
            "description": "MX DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "NS": {
            "description": "NS DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "A": {
            "description": "A DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "AAAA": {
            "description": "AAAA DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "TXT": {
            "description": "TXT DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "SRV": {
            "description": "SRV DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "PTR": {
            "description": "PTR DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "SOA": {
            "description": "SOA DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "SPF": {
            "description": "SPF DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "DNSKEY": {
            "description": "DNSKEY DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "DS": {
            "description": "DS DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "NSEC": {
            "description": "NSEC DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          },
          "NSEC3": {
            "description": "NSEC3 DNS records",
            "items": {
              "type": "string"
            },
            "type": "array"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-dns-records-cname",
        "path": "config.dnsRecords.CNAME",
        "required": false,
        "description": "CNAME DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-mx",
        "path": "config.dnsRecords.MX",
        "required": false,
        "description": "MX DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-ns",
        "path": "config.dnsRecords.NS",
        "required": false,
        "description": "NS DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-a",
        "path": "config.dnsRecords.A",
        "required": false,
        "description": "A DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-aaaa",
        "path": "config.dnsRecords.AAAA",
        "required": false,
        "description": "AAAA DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-txt",
        "path": "config.dnsRecords.TXT",
        "required": false,
        "description": "TXT DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-srv",
        "path": "config.dnsRecords.SRV",
        "required": false,
        "description": "SRV DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-ptr",
        "path": "config.dnsRecords.PTR",
        "required": false,
        "description": "PTR DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-soa",
        "path": "config.dnsRecords.SOA",
        "required": false,
        "description": "SOA DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-spf",
        "path": "config.dnsRecords.SPF",
        "required": false,
        "description": "SPF DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-dnskey",
        "path": "config.dnsRecords.DNSKEY",
        "required": false,
        "description": "DNSKEY DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-ds",
        "path": "config.dnsRecords.DS",
        "required": false,
        "description": "DS DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-nsec",
        "path": "config.dnsRecords.NSEC",
        "required": false,
        "description": "NSEC DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-dns-records-nsec3",
        "path": "config.dnsRecords.NSEC3",
        "required": false,
        "description": "NSEC3 DNS records",
        "items": {
          "type": "string"
        },
        "type": "array"
      },
      {
        "flag": "config-ssl-expiration-period-days",
        "path": "config.sslExpirationPeriodDays",
        "required": false,
        "description": "Days before certificate expiry to send SSL expiration reminders (0-365, max 10 items). Requires the top-level `sslExpirationReminder` flag to be enabled. HTTP, Keyword and API monitors only. Send null to remove.",
        "example": [
          7,
          14,
          30
        ],
        "items": {
          "maximum": 365,
          "minimum": 0,
          "type": "number"
        },
        "maxItems": 10,
        "nullable": true,
        "type": "array"
      },
      {
        "flag": "config-api-assertions",
        "path": "config.apiAssertions",
        "required": false,
        "description": "API monitor assertions configuration. Required for API monitors — the merged config must still contain it. Send null to remove.",
        "nullable": true,
        "properties": {
          "logic": {
            "description": "Logic for combining assertions",
            "enum": [
              "AND",
              "OR"
            ],
            "example": "AND",
            "type": "string"
          },
          "checks": {
            "description": "Array of assertion checks (1-5)",
            "items": {
              "properties": {
                "property": {
                  "description": "Assertion source: safe JSONPath, headers.<name>, status_code, or body",
                  "example": "$.data.status",
                  "maxLength": 500,
                  "type": "string"
                },
                "comparison": {
                  "description": "Comparison operator",
                  "enum": [
                    "equals",
                    "not_equals",
                    "contains",
                    "not_contains",
                    "greater_than",
                    "less_than",
                    "is_null",
                    "is_not_null",
                    "is_string",
                    "is_number",
                    "is_boolean",
                    "is_array",
                    "is_object",
                    "is_empty",
                    "is_not_empty",
                    "length_equals",
                    "length_not_equals",
                    "length_greater_than",
                    "length_less_than",
                    "exists",
                    "not_exists"
                  ],
                  "example": "equals",
                  "type": "string"
                },
                "target": {
                  "description": "Expected native JSON value. Arrays and objects are supported for body-JSON equality and containment; omit target for null, type, existence, and empty comparisons.",
                  "example": [
                    "active",
                    {
                      "role": "primary"
                    }
                  ],
                  "type": "json"
                }
              },
              "requiredProperties": [
                "property",
                "comparison"
              ],
              "type": "object"
            },
            "type": "array"
          }
        },
        "requiredProperties": [
          "logic",
          "checks"
        ],
        "type": "object"
      },
      {
        "flag": "config-api-assertions-logic",
        "path": "config.apiAssertions.logic",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Logic for combining assertions",
        "enum": [
          "AND",
          "OR"
        ],
        "example": "AND",
        "type": "string"
      },
      {
        "flag": "config-api-assertions-checks",
        "path": "config.apiAssertions.checks",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Array of assertion checks (1-5)",
        "items": {
          "properties": {
            "property": {
              "description": "Assertion source: safe JSONPath, headers.<name>, status_code, or body",
              "example": "$.data.status",
              "maxLength": 500,
              "type": "string"
            },
            "comparison": {
              "description": "Comparison operator",
              "enum": [
                "equals",
                "not_equals",
                "contains",
                "not_contains",
                "greater_than",
                "less_than",
                "is_null",
                "is_not_null",
                "is_string",
                "is_number",
                "is_boolean",
                "is_array",
                "is_object",
                "is_empty",
                "is_not_empty",
                "length_equals",
                "length_not_equals",
                "length_greater_than",
                "length_less_than",
                "exists",
                "not_exists"
              ],
              "example": "equals",
              "type": "string"
            },
            "target": {
              "description": "Expected native JSON value. Arrays and objects are supported for body-JSON equality and containment; omit target for null, type, existence, and empty comparisons.",
              "example": [
                "active",
                {
                  "role": "primary"
                }
              ],
              "type": "json"
            }
          },
          "requiredProperties": [
            "property",
            "comparison"
          ],
          "type": "object"
        },
        "type": "array"
      },
      {
        "flag": "config-udp",
        "path": "config.udp",
        "required": false,
        "description": "UDP monitor configuration. UDP monitors only. Send null to remove.",
        "nullable": true,
        "properties": {
          "payload": {
            "description": "UDP payload to send",
            "type": "string"
          },
          "packetLossThreshold": {
            "description": "Packet loss threshold percentage",
            "type": "number"
          }
        },
        "requiredProperties": [
          "packetLossThreshold"
        ],
        "type": "object"
      },
      {
        "flag": "config-udp-payload",
        "path": "config.udp.payload",
        "required": false,
        "description": "UDP payload to send",
        "type": "string"
      },
      {
        "flag": "config-udp-packet-loss-threshold",
        "path": "config.udp.packetLossThreshold",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Packet loss threshold percentage",
        "type": "number"
      },
      {
        "flag": "config-ip-version",
        "path": "config.ipVersion",
        "required": false,
        "description": "IP version preference. Omit for default behavior (IPv4 priority, falls back to IPv6). Not supported by DNS, Heartbeat, Visual Comparison or third-party service monitors. Send null to remove.",
        "enum": [
          "ipv4Only",
          "ipv6Only"
        ],
        "example": "ipv4Only",
        "nullable": true,
        "type": "string"
      },
      {
        "flag": "config-application-error-retries",
        "path": "config.applicationErrorRetries",
        "required": false,
        "description": "Number of retries on application errors (HTTP 4xx/5xx). 0-3. Connection errors always retry 3 times regardless of this setting. HTTP, Keyword and API monitors only. Send null to remove.",
        "example": 1,
        "maximum": 3,
        "minimum": 0,
        "nullable": true,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison",
        "path": "config.visualComparison",
        "required": false,
        "description": "Visual comparison configuration. Visual Comparison monitors only. Send null to remove.",
        "nullable": true,
        "properties": {
          "sensitivityThreshold": {
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "viewport": {
            "enum": [
              "desktop",
              "mobile"
            ],
            "type": "string"
          },
          "areaCoordinates": {
            "properties": {
              "percentX": {
                "description": "Left edge (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "percentY": {
                "description": "Top edge (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "percentWidth": {
                "description": "Width (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              },
              "percentHeight": {
                "description": "Height (percent)",
                "maximum": 100,
                "minimum": 0,
                "type": "number"
              }
            },
            "requiredProperties": [
              "percentX",
              "percentY",
              "percentWidth",
              "percentHeight"
            ],
            "type": "object"
          }
        },
        "type": "object"
      },
      {
        "flag": "config-visual-comparison-sensitivity-threshold",
        "path": "config.visualComparison.sensitivityThreshold",
        "required": false,
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-viewport",
        "path": "config.visualComparison.viewport",
        "required": false,
        "enum": [
          "desktop",
          "mobile"
        ],
        "type": "string"
      },
      {
        "flag": "config-visual-comparison-area-coordinates",
        "path": "config.visualComparison.areaCoordinates",
        "required": false,
        "properties": {
          "percentX": {
            "description": "Left edge (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "percentY": {
            "description": "Top edge (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "percentWidth": {
            "description": "Width (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          },
          "percentHeight": {
            "description": "Height (percent)",
            "maximum": 100,
            "minimum": 0,
            "type": "number"
          }
        },
        "requiredProperties": [
          "percentX",
          "percentY",
          "percentWidth",
          "percentHeight"
        ],
        "type": "object"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-x",
        "path": "config.visualComparison.areaCoordinates.percentX",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Left edge (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-y",
        "path": "config.visualComparison.areaCoordinates.percentY",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Top edge (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-width",
        "path": "config.visualComparison.areaCoordinates.percentWidth",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Width (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-visual-comparison-area-coordinates-percent-height",
        "path": "config.visualComparison.areaCoordinates.percentHeight",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Height (percent)",
        "maximum": 100,
        "minimum": 0,
        "type": "number"
      },
      {
        "flag": "config-third-party-service",
        "path": "config.thirdPartyService",
        "required": false,
        "description": "Third party service configuration - the isdown provider to track and, optionally, which of its components to scope tracking to. Third party services only. Send null to remove.",
        "nullable": true,
        "properties": {
          "trackedComponentIds": {
            "description": "Component ids to scope tracking to (isdown components.id, not external_id). Every id must belong to the monitor provider. Omit to leave the scope unchanged, set to null or [] to track every component.",
            "example": [
              555,
              556
            ],
            "items": {
              "type": "number"
            },
            "nullable": true,
            "type": "array"
          },
          "notify": {
            "description": "Notification tuning. Replaces the stored value as a whole. Omit to leave unchanged.",
            "properties": {
              "severity": {
                "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
                "enum": [
                  "all",
                  "major",
                  "none"
                ],
                "example": "major",
                "type": "string"
              },
              "incrementalUpdates": {
                "description": "Also notify on incremental updates of an incident already notified.",
                "example": true,
                "type": "boolean"
              }
            },
            "requiredProperties": [
              "severity",
              "incrementalUpdates"
            ],
            "type": "object"
          },
          "maintenanceNotificationsEnabled": {
            "description": "Notify when the provider schedules or updates a maintenance. Omit to leave unchanged.",
            "example": true,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "aliases": [
          "config-third-party-service-tracked-component-ids"
        ],
        "flag": "components",
        "path": "config.thirdPartyService.trackedComponentIds",
        "required": false,
        "description": "Component ids to scope tracking to (isdown components.id, not external_id). Every id must belong to the monitor provider. Omit to leave the scope unchanged, set to null or [] to track every component.",
        "example": [
          555,
          556
        ],
        "items": {
          "type": "number"
        },
        "nullable": true,
        "type": "array"
      },
      {
        "flag": "config-third-party-service-notify",
        "path": "config.thirdPartyService.notify",
        "required": false,
        "description": "Notification tuning. Replaces the stored value as a whole. Omit to leave unchanged.",
        "properties": {
          "severity": {
            "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
            "enum": [
              "all",
              "major",
              "none"
            ],
            "example": "major",
            "type": "string"
          },
          "incrementalUpdates": {
            "description": "Also notify on incremental updates of an incident already notified.",
            "example": true,
            "type": "boolean"
          }
        },
        "requiredProperties": [
          "severity",
          "incrementalUpdates"
        ],
        "type": "object"
      },
      {
        "aliases": [
          "config-third-party-service-notify-severity"
        ],
        "flag": "notify-severity",
        "path": "config.thirdPartyService.notify.severity",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Which provider incidents notify: every severity (all), only major outages (major), or none.",
        "enum": [
          "all",
          "major",
          "none"
        ],
        "example": "major",
        "type": "string"
      },
      {
        "aliases": [
          "config-third-party-service-notify-incremental-updates"
        ],
        "flag": "notify-incremental-updates",
        "path": "config.thirdPartyService.notify.incrementalUpdates",
        "required": false,
        "requiredWhenParentPresent": true,
        "description": "Also notify on incremental updates of an incident already notified.",
        "example": true,
        "type": "boolean"
      },
      {
        "flag": "config-third-party-service-maintenance-notifications-enabled",
        "path": "config.thirdPartyService.maintenanceNotificationsEnabled",
        "required": false,
        "description": "Notify when the provider schedules or updates a maintenance. Omit to leave unchanged.",
        "example": true,
        "type": "boolean"
      }
    ]
  },
  "monitors:uptime-stats": {
    "commandId": "monitors:uptime-stats",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns aggregated uptime statistics across all monitors for the specified timeframe, including a logs array of incident entries.",
    "destructive": false,
    "method": "GET",
    "operationId": "MonitorsController_getUptimeStats",
    "parameters": [
      {
        "default": 50,
        "description": "Maximum number of log entries to return (1-500).",
        "example": 50,
        "in": "query",
        "maximum": 500,
        "minimum": 1,
        "name": "logLimit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Timeframe for statistics. Use CUSTOM with start/end for custom range.",
        "enum": [
          "DAY",
          "WEEK",
          "MONTH",
          "DAYS_30",
          "YEAR",
          "ALL",
          "CUSTOM"
        ],
        "in": "query",
        "name": "timeFrame",
        "required": true,
        "type": "string"
      },
      {
        "description": "Start timestamp (Unix seconds). Required when timeFrame=CUSTOM.",
        "in": "query",
        "minimum": 1,
        "name": "start",
        "required": false,
        "type": "number"
      },
      {
        "description": "End timestamp (Unix seconds). Required when timeFrame=CUSTOM. Must be > start.",
        "in": "query",
        "minimum": 0,
        "name": "end",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/monitors/uptime-stats",
    "requestBodyRequired": false,
    "summary": "Get aggregated uptime statistics",
    "tags": [
      "Monitors"
    ]
  },
  "status-pages:announcements:create": {
    "commandId": "status-pages:announcements:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a new announcement for a Public Status Page",
    "destructive": false,
    "method": "POST",
    "operationId": "PspAnnouncementsController_create",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements",
    "requestBodyRequired": true,
    "summary": "Create an announcement",
    "tags": [
      "PSP Announcements"
    ],
    "requestBodyFields": [
      {
        "flag": "title",
        "path": "title",
        "required": false,
        "description": "Title of the announcement",
        "example": "Scheduled Maintenance",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "content",
        "path": "content",
        "required": false,
        "description": "Content of the announcement",
        "example": "We will be performing scheduled maintenance on our servers.",
        "maxLength": 2000,
        "type": "string"
      },
      {
        "flag": "status",
        "path": "status",
        "required": false,
        "description": "Status of the announcement. Possible values: Offline (draft, not visible on status page), Pending (scheduled for publication), Published (currently visible on status page), Archived (historical record, no longer visible)",
        "enum": [
          "Offline",
          "Pending",
          "Published",
          "Archived"
        ],
        "example": "Pending",
        "type": "string"
      },
      {
        "flag": "type",
        "path": "type",
        "required": false,
        "description": "Type of the announcement. Possible values: Info (general information), Maintenance (scheduled maintenance notification), Issue (incident or issue notification)",
        "enum": [
          "Info",
          "Maintenance",
          "Issue"
        ],
        "example": "Maintenance",
        "type": "string"
      },
      {
        "flag": "start-date",
        "path": "startDate",
        "required": false,
        "description": "Start date of the announcement (ISO 8601 format)",
        "example": "2024-01-15T10:00:00.000Z",
        "type": "string"
      },
      {
        "flag": "end-date",
        "path": "endDate",
        "required": false,
        "description": "End date of the announcement (ISO 8601 format)",
        "example": "2024-01-15T14:00:00.000Z",
        "nullable": true,
        "type": "string"
      }
    ]
  },
  "status-pages:announcements:delete": {
    "commandId": "status-pages:announcements:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Permanently delete an announcement from a Public Status Page. This cannot be undone.",
    "destructive": true,
    "method": "DELETE",
    "operationId": "PspAnnouncementsController_delete",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      },
      {
        "description": "ID of the announcement to delete",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements/{id}",
    "requestBodyRequired": false,
    "summary": "Delete an announcement",
    "tags": [
      "PSP Announcements"
    ]
  },
  "status-pages:announcements:get": {
    "commandId": "status-pages:announcements:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Retrieve a single announcement for a Public Status Page",
    "destructive": false,
    "method": "GET",
    "operationId": "PspAnnouncementsController_get",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      },
      {
        "description": "ID of the announcement",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements/{id}",
    "requestBodyRequired": false,
    "summary": "Get an announcement by ID",
    "tags": [
      "PSP Announcements"
    ]
  },
  "status-pages:announcements:list": {
    "commandId": "status-pages:announcements:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List all announcements for a Public Status Page. Results are sorted by creation date (newest first) and can be filtered by status.",
    "destructive": false,
    "method": "GET",
    "operationId": "PspAnnouncementsController_list",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      },
      {
        "description": "Maximum number of announcements to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Filter announcements by status",
        "enum": [
          "OFFLINE",
          "PENDING",
          "PUBLISHED",
          "ARCHIVED"
        ],
        "in": "query",
        "name": "status",
        "required": false,
        "type": "string"
      },
      {
        "description": "Cursor to paginate through announcements",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements",
    "requestBodyRequired": false,
    "summary": "List announcements",
    "tags": [
      "PSP Announcements"
    ]
  },
  "status-pages:announcements:pin": {
    "commandId": "status-pages:announcements:pin",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Pin an announcement to the Public Status Page. This operation is idempotent.",
    "destructive": false,
    "method": "POST",
    "operationId": "PspAnnouncementsController_pin",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      },
      {
        "description": "ID of the announcement to pin",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements/{id}/pin",
    "requestBodyRequired": false,
    "summary": "Pin an announcement",
    "tags": [
      "PSP Announcements"
    ]
  },
  "status-pages:announcements:unpin": {
    "commandId": "status-pages:announcements:unpin",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Unpin an announcement from the Public Status Page. This operation is idempotent.",
    "destructive": false,
    "method": "POST",
    "operationId": "PspAnnouncementsController_unpin",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      },
      {
        "description": "ID of the announcement to unpin",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements/{id}/unpin",
    "requestBodyRequired": false,
    "summary": "Unpin an announcement",
    "tags": [
      "PSP Announcements"
    ]
  },
  "status-pages:announcements:update": {
    "commandId": "status-pages:announcements:update",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update an existing announcement for a Public Status Page",
    "destructive": false,
    "method": "PATCH",
    "operationId": "PspAnnouncementsController_update",
    "parameters": [
      {
        "description": "ID of the Public Status Page",
        "in": "path",
        "name": "pspId",
        "required": true,
        "type": "number"
      },
      {
        "description": "ID of the announcement to update",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{pspId}/announcements/{id}",
    "requestBodyRequired": true,
    "summary": "Update an announcement",
    "tags": [
      "PSP Announcements"
    ],
    "requestBodyFields": [
      {
        "flag": "title",
        "path": "title",
        "required": false,
        "description": "Title of the announcement",
        "example": "Scheduled Maintenance",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "content",
        "path": "content",
        "required": false,
        "description": "Content of the announcement",
        "example": "We will be performing scheduled maintenance on our servers.",
        "maxLength": 2000,
        "type": "string"
      },
      {
        "flag": "status",
        "path": "status",
        "required": false,
        "description": "Status of the announcement. Possible values: Offline (draft, not visible on status page), Pending (scheduled for publication), Published (currently visible on status page), Archived (historical record, no longer visible)",
        "enum": [
          "Offline",
          "Pending",
          "Published",
          "Archived"
        ],
        "example": "Pending",
        "type": "string"
      },
      {
        "flag": "type",
        "path": "type",
        "required": false,
        "description": "Type of the announcement. Possible values: Info (general information), Maintenance (scheduled maintenance notification), Issue (incident or issue notification)",
        "enum": [
          "Info",
          "Maintenance",
          "Issue"
        ],
        "example": "Maintenance",
        "type": "string"
      },
      {
        "flag": "start-date",
        "path": "startDate",
        "required": false,
        "description": "Start date of the announcement (ISO 8601 format)",
        "example": "2024-01-15T10:00:00.000Z",
        "type": "string"
      },
      {
        "flag": "end-date",
        "path": "endDate",
        "required": false,
        "description": "End date of the announcement (ISO 8601 format)",
        "example": "2024-01-15T14:00:00.000Z",
        "nullable": true,
        "type": "string"
      }
    ]
  },
  "status-pages:create": {
    "commandId": "status-pages:create",
    "contentTypes": [
      "application/json",
      "multipart/form-data"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a Public Status Page.\n\nSend `application/json` unless you are uploading a logo — it is the only content type that can express nested objects and arrays without ambiguity. Reserve `multipart/form-data` for requests that carry a `logo` file. In multipart, send arrays as a repeated field (`monitorIds=1&monitorIds=2`) or with the bracket suffix (`monitorIds[]=1`), and send `monitorIds[]=` with no value for an empty array.",
    "destructive": false,
    "method": "POST",
    "operationId": "PspController_create",
    "parameters": [],
    "path": "/psps",
    "requestBodyRequired": true,
    "summary": "Create a PSP",
    "tags": [
      "Public Status Pages"
    ],
    "requestBodyFields": [
      {
        "flag": "monitor-ids",
        "path": "monitorIds",
        "required": false,
        "description": "List of monitor IDs to be assigned to the PSP. `[0]` on its own is the sentinel for \"every monitor in the account\"; an empty array detaches all of them. In multipart/form-data, repeat the field (`monitorIds=1&monitorIds=2`) or use the bracket suffix (`monitorIds[]=1`); `monitorIds[]=` with no value is the empty array.",
        "items": {
          "maximum": 2147483647,
          "minimum": 0,
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "tag-ids",
        "path": "tagIds",
        "required": false,
        "description": "List of tag IDs to be assigned to the PSP. Uses the same multipart encoding as `monitorIds`.",
        "items": {
          "maximum": 2147483647,
          "minimum": 1,
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "auto-add-monitors",
        "path": "autoAddMonitors",
        "required": false,
        "description": "If enabled all monitors (old and new) will be added to PSP automatically. An explicit \"monitorIds\" wins over this flag when both are sent — including an empty \"monitorIds\", which detaches every monitor.",
        "type": "boolean"
      },
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": true,
        "description": "Friendly name of the Public Status Page",
        "example": "My Status Page",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "logo",
        "path": "logo",
        "required": false,
        "description": "Logo image file. Accepted formats: JPG, JPEG, PNG. Max file size: 150 KB. Dimensions: width 20-400px, height 10-200px.",
        "type": "string"
      },
      {
        "flag": "icon",
        "path": "icon",
        "required": false,
        "description": "Icon image file. Accepted formats: JPG, JPEG, PNG. Max file size: 150 KB. Dimensions: width 20-400px, height 10-200px.",
        "type": "string"
      },
      {
        "flag": "password",
        "path": "password",
        "required": false,
        "description": "Password protection for the Public Status Page",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "custom-domain",
        "path": "customDomain",
        "required": false,
        "description": "Provide when you want to use custom domain for the Public Status Page",
        "example": "status.your-domain.com",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "hide-url-links",
        "path": "hideUrlLinks",
        "required": false,
        "description": "This will hide \"Powered by UptimeRobot\" link in footer",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "no-index",
        "path": "noIndex",
        "required": false,
        "description": "Set HTML meta tag to allow or disallow search engines to index your status page",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "ga-code",
        "path": "gaCode",
        "required": false,
        "description": "Available only for a Custom Domain status page",
        "example": "G-xxxxxxxxxx",
        "type": "string"
      },
      {
        "flag": "sort",
        "path": "sort",
        "required": false,
        "description": "Sort monitors by friendly name or their statuses. Manual is read-only — a manual order can only be arranged in the dashboard.",
        "enum": [
          "FriendlyNameAsc",
          "FriendlyNameDesc",
          "StatusUpDownPaused",
          "StatusDownUpPaused"
        ],
        "example": "FriendlyNameAsc",
        "type": "string"
      },
      {
        "flag": "status",
        "path": "status",
        "required": false,
        "description": "Send \"ENABLED\" to publish the status page, \"PAUSED\" to un-publish it",
        "enum": [
          "PAUSED",
          "ENABLED"
        ],
        "example": "ENABLED",
        "type": "string"
      },
      {
        "flag": "subscription",
        "path": "subscription",
        "required": false,
        "description": "Subscribers can subscribe to receive announcements via an e-mail.",
        "type": "boolean"
      },
      {
        "flag": "share-analytics-consent",
        "path": "shareAnalyticsConsent",
        "required": false,
        "default": false,
        "description": "Help us improve the Status Pages by sharing the analytics data with us.",
        "type": "boolean"
      },
      {
        "flag": "homepage-link",
        "path": "homepageLink",
        "required": false,
        "default": "https://uptimerobot.com",
        "description": "The link target for the logo (or main title) on status page. Usually leads to your homepage.",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "show-cookie-bar",
        "path": "showCookieBar",
        "required": false,
        "default": false,
        "description": "Available only for a Custom domain status page",
        "type": "boolean"
      },
      {
        "flag": "use-small-cookie-consent-modal",
        "path": "useSmallCookieConsentModal",
        "required": false,
        "description": "Allowing visitor to interact with the page - should not be used on public pages",
        "type": "boolean"
      },
      {
        "flag": "custom-settings",
        "path": "customSettings",
        "required": false,
        "properties": {
          "font": {
            "nullable": true,
            "properties": {
              "family": {
                "description": "The font family to use for the PSP. Google fonts are supported.",
                "example": "Roboto",
                "type": "string"
              }
            },
            "type": "object"
          },
          "page": {
            "nullable": true,
            "properties": {
              "layout": {
                "description": "The alignment of the logo on the page",
                "enum": [
                  "LogoOnLeft",
                  "LogoOnCenter"
                ],
                "example": "logo_on_center",
                "type": "string"
              },
              "theme": {
                "description": "The theme of the page",
                "enum": [
                  "Light",
                  "Dark"
                ],
                "example": "light",
                "type": "string"
              },
              "density": {
                "description": "The density of the page",
                "enum": [
                  "Normal",
                  "Compact"
                ],
                "example": "normal",
                "type": "string"
              },
              "showMonitorsUnderGroups": {
                "description": "Group the monitors on the status page home screen under their monitor groups instead of listing them flat. Omit it to keep the current value.",
                "example": false,
                "type": "boolean"
              }
            },
            "type": "object"
          },
          "colors": {
            "description": "The colors of the page",
            "nullable": true,
            "properties": {
              "main": {
                "description": "The main color of the page in hex format",
                "example": "#131a26",
                "type": "string"
              },
              "text": {
                "description": "The text color of the page in hex format",
                "example": "#ffffff",
                "type": "string"
              },
              "link": {
                "description": "The link color of the page in hex format",
                "example": "#3bd671",
                "type": "string"
              }
            },
            "type": "object"
          },
          "features": {
            "nullable": true,
            "properties": {
              "showBars": {
                "description": "Show or hide the bar charts for uptime of a monitor on a status page home screen",
                "example": false,
                "type": "boolean"
              },
              "showUptimePercentage": {
                "description": "Show or hide the uptime percentage of a monitor near the monitor name on a status page home screen",
                "example": false,
                "type": "boolean"
              },
              "enableFloatingStatus": {
                "description": "Enable or disable the floating bar sticked to the bottom with the overall count of up and down monitors",
                "example": false,
                "type": "boolean"
              },
              "showOverallUptime": {
                "description": "Show or hide the overall uptime (last 24 h, last 7 and 30 days) section below monitors list on a status page home screen",
                "example": false,
                "type": "boolean"
              },
              "showOutageUpdates": {
                "description": "Show outage reason details (like status code) to give more explanation for your status page users",
                "example": false,
                "type": "boolean"
              },
              "showOutageDetails": {
                "description": "Show or hide downtimes grouped by day for a specific monitor in the Announcement feed. The latest downtime will be visible in header. This won't hide the events on a details page",
                "example": false,
                "type": "boolean"
              },
              "enableDetailsPage": {
                "description": "Details page contains uptime, response times and up/down event history",
                "example": false,
                "type": "boolean"
              },
              "showMonitorURL": {
                "description": "Show monitor URL and type to give your users more details on your Status page",
                "example": false,
                "type": "boolean"
              },
              "hidePausedMonitors": {
                "description": "Don't display paused monitors on your Status page",
                "example": false,
                "type": "boolean"
              }
            },
            "type": "object"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-font",
        "path": "customSettings.font",
        "required": false,
        "nullable": true,
        "properties": {
          "family": {
            "description": "The font family to use for the PSP. Google fonts are supported.",
            "example": "Roboto",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-font-family",
        "path": "customSettings.font.family",
        "required": false,
        "description": "The font family to use for the PSP. Google fonts are supported.",
        "example": "Roboto",
        "type": "string"
      },
      {
        "flag": "custom-settings-page",
        "path": "customSettings.page",
        "required": false,
        "nullable": true,
        "properties": {
          "layout": {
            "description": "The alignment of the logo on the page",
            "enum": [
              "LogoOnLeft",
              "LogoOnCenter"
            ],
            "example": "logo_on_center",
            "type": "string"
          },
          "theme": {
            "description": "The theme of the page",
            "enum": [
              "Light",
              "Dark"
            ],
            "example": "light",
            "type": "string"
          },
          "density": {
            "description": "The density of the page",
            "enum": [
              "Normal",
              "Compact"
            ],
            "example": "normal",
            "type": "string"
          },
          "showMonitorsUnderGroups": {
            "description": "Group the monitors on the status page home screen under their monitor groups instead of listing them flat. Omit it to keep the current value.",
            "example": false,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-page-layout",
        "path": "customSettings.page.layout",
        "required": false,
        "description": "The alignment of the logo on the page",
        "enum": [
          "LogoOnLeft",
          "LogoOnCenter"
        ],
        "example": "logo_on_center",
        "type": "string"
      },
      {
        "flag": "custom-settings-page-theme",
        "path": "customSettings.page.theme",
        "required": false,
        "description": "The theme of the page",
        "enum": [
          "Light",
          "Dark"
        ],
        "example": "light",
        "type": "string"
      },
      {
        "flag": "custom-settings-page-density",
        "path": "customSettings.page.density",
        "required": false,
        "description": "The density of the page",
        "enum": [
          "Normal",
          "Compact"
        ],
        "example": "normal",
        "type": "string"
      },
      {
        "flag": "custom-settings-page-show-monitors-under-groups",
        "path": "customSettings.page.showMonitorsUnderGroups",
        "required": false,
        "description": "Group the monitors on the status page home screen under their monitor groups instead of listing them flat. Omit it to keep the current value.",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-colors",
        "path": "customSettings.colors",
        "required": false,
        "description": "The colors of the page",
        "nullable": true,
        "properties": {
          "main": {
            "description": "The main color of the page in hex format",
            "example": "#131a26",
            "type": "string"
          },
          "text": {
            "description": "The text color of the page in hex format",
            "example": "#ffffff",
            "type": "string"
          },
          "link": {
            "description": "The link color of the page in hex format",
            "example": "#3bd671",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-colors-main",
        "path": "customSettings.colors.main",
        "required": false,
        "description": "The main color of the page in hex format",
        "example": "#131a26",
        "type": "string"
      },
      {
        "flag": "custom-settings-colors-text",
        "path": "customSettings.colors.text",
        "required": false,
        "description": "The text color of the page in hex format",
        "example": "#ffffff",
        "type": "string"
      },
      {
        "flag": "custom-settings-colors-link",
        "path": "customSettings.colors.link",
        "required": false,
        "description": "The link color of the page in hex format",
        "example": "#3bd671",
        "type": "string"
      },
      {
        "flag": "custom-settings-features",
        "path": "customSettings.features",
        "required": false,
        "nullable": true,
        "properties": {
          "showBars": {
            "description": "Show or hide the bar charts for uptime of a monitor on a status page home screen",
            "example": false,
            "type": "boolean"
          },
          "showUptimePercentage": {
            "description": "Show or hide the uptime percentage of a monitor near the monitor name on a status page home screen",
            "example": false,
            "type": "boolean"
          },
          "enableFloatingStatus": {
            "description": "Enable or disable the floating bar sticked to the bottom with the overall count of up and down monitors",
            "example": false,
            "type": "boolean"
          },
          "showOverallUptime": {
            "description": "Show or hide the overall uptime (last 24 h, last 7 and 30 days) section below monitors list on a status page home screen",
            "example": false,
            "type": "boolean"
          },
          "showOutageUpdates": {
            "description": "Show outage reason details (like status code) to give more explanation for your status page users",
            "example": false,
            "type": "boolean"
          },
          "showOutageDetails": {
            "description": "Show or hide downtimes grouped by day for a specific monitor in the Announcement feed. The latest downtime will be visible in header. This won't hide the events on a details page",
            "example": false,
            "type": "boolean"
          },
          "enableDetailsPage": {
            "description": "Details page contains uptime, response times and up/down event history",
            "example": false,
            "type": "boolean"
          },
          "showMonitorURL": {
            "description": "Show monitor URL and type to give your users more details on your Status page",
            "example": false,
            "type": "boolean"
          },
          "hidePausedMonitors": {
            "description": "Don't display paused monitors on your Status page",
            "example": false,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-features-show-bars",
        "path": "customSettings.features.showBars",
        "required": false,
        "description": "Show or hide the bar charts for uptime of a monitor on a status page home screen",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-uptime-percentage",
        "path": "customSettings.features.showUptimePercentage",
        "required": false,
        "description": "Show or hide the uptime percentage of a monitor near the monitor name on a status page home screen",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-enable-floating-status",
        "path": "customSettings.features.enableFloatingStatus",
        "required": false,
        "description": "Enable or disable the floating bar sticked to the bottom with the overall count of up and down monitors",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-overall-uptime",
        "path": "customSettings.features.showOverallUptime",
        "required": false,
        "description": "Show or hide the overall uptime (last 24 h, last 7 and 30 days) section below monitors list on a status page home screen",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-outage-updates",
        "path": "customSettings.features.showOutageUpdates",
        "required": false,
        "description": "Show outage reason details (like status code) to give more explanation for your status page users",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-outage-details",
        "path": "customSettings.features.showOutageDetails",
        "required": false,
        "description": "Show or hide downtimes grouped by day for a specific monitor in the Announcement feed. The latest downtime will be visible in header. This won't hide the events on a details page",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-enable-details-page",
        "path": "customSettings.features.enableDetailsPage",
        "required": false,
        "description": "Details page contains uptime, response times and up/down event history",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-monitor-url",
        "path": "customSettings.features.showMonitorURL",
        "required": false,
        "description": "Show monitor URL and type to give your users more details on your Status page",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-hide-paused-monitors",
        "path": "customSettings.features.hidePausedMonitors",
        "required": false,
        "description": "Don't display paused monitors on your Status page",
        "example": false,
        "type": "boolean"
      }
    ]
  },
  "status-pages:delete": {
    "commandId": "status-pages:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete a Public Status Page",
    "destructive": true,
    "method": "DELETE",
    "operationId": "PspController_delete",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{id}",
    "requestBodyRequired": false,
    "summary": "Delete a PSP",
    "tags": [
      "Public Status Pages"
    ]
  },
  "status-pages:get": {
    "commandId": "status-pages:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get a Public Status Page by ID",
    "destructive": false,
    "method": "GET",
    "operationId": "PspController_get",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{id}",
    "requestBodyRequired": false,
    "summary": "Get a PSP by ID",
    "tags": [
      "Public Status Pages"
    ]
  },
  "status-pages:list": {
    "commandId": "status-pages:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "List Public Status Pages",
    "destructive": false,
    "method": "GET",
    "operationId": "PspController_list",
    "parameters": [
      {
        "description": "Maximum number of status pages to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Cursor to paginate through PSPs",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/psps",
    "requestBodyRequired": false,
    "summary": "List PSPs",
    "tags": [
      "Public Status Pages"
    ]
  },
  "status-pages:update": {
    "commandId": "status-pages:update",
    "contentTypes": [
      "application/json",
      "multipart/form-data"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update a Public Status Page.\n\nSend `application/json` unless you are uploading a logo or icon — it is the only content type that can express nested objects and arrays without ambiguity. Reserve `multipart/form-data` for requests that carry a `logo` or `icon` file. In multipart, send arrays as a repeated field (`monitorIds=1&monitorIds=2`) or with the bracket suffix (`monitorIds[]=1`), and send `monitorIds[]=` with no value for an empty array.",
    "destructive": false,
    "method": "PATCH",
    "operationId": "PspController_update",
    "parameters": [
      {
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/psps/{id}",
    "requestBodyRequired": true,
    "summary": "Update a PSP",
    "tags": [
      "Public Status Pages"
    ],
    "requestBodyFields": [
      {
        "flag": "monitor-ids",
        "path": "monitorIds",
        "required": false,
        "description": "List of monitor IDs to be assigned to the PSP. `[0]` on its own is the sentinel for \"every monitor in the account\"; an empty array detaches all of them. In multipart/form-data, repeat the field (`monitorIds=1&monitorIds=2`) or use the bracket suffix (`monitorIds[]=1`); `monitorIds[]=` with no value is the empty array.",
        "items": {
          "maximum": 2147483647,
          "minimum": 0,
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "tag-ids",
        "path": "tagIds",
        "required": false,
        "description": "List of tag IDs to be assigned to the PSP. Uses the same multipart encoding as `monitorIds`.",
        "items": {
          "maximum": 2147483647,
          "minimum": 1,
          "type": "number"
        },
        "type": "array"
      },
      {
        "flag": "auto-add-monitors",
        "path": "autoAddMonitors",
        "required": false,
        "description": "If enabled all monitors (old and new) will be added to PSP automatically. An explicit \"monitorIds\" wins over this flag when both are sent — including an empty \"monitorIds\", which detaches every monitor.",
        "type": "boolean"
      },
      {
        "aliases": [
          "friendly-name"
        ],
        "flag": "name",
        "path": "friendlyName",
        "required": false,
        "description": "Friendly name of the Public Status Page",
        "example": "My Status Page",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "logo",
        "path": "logo",
        "required": false,
        "description": "Logo image file. Accepted formats: JPG, JPEG, PNG. Max file size: 150 KB. Dimensions: width 20-400px, height 10-200px.",
        "type": "string"
      },
      {
        "flag": "icon",
        "path": "icon",
        "required": false,
        "description": "Icon image file. Accepted formats: JPG, JPEG, PNG. Max file size: 150 KB. Dimensions: width 20-400px, height 10-200px.",
        "type": "string"
      },
      {
        "flag": "password",
        "path": "password",
        "required": false,
        "description": "Password protection for the Public Status Page",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "custom-domain",
        "path": "customDomain",
        "required": false,
        "description": "Provide when you want to use custom domain for the Public Status Page",
        "example": "status.your-domain.com",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "hide-url-links",
        "path": "hideUrlLinks",
        "required": false,
        "description": "This will hide \"Powered by UptimeRobot\" link in footer",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "no-index",
        "path": "noIndex",
        "required": false,
        "description": "Set HTML meta tag to allow or disallow search engines to index your status page",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "ga-code",
        "path": "gaCode",
        "required": false,
        "description": "Available only for a Custom Domain status page",
        "example": "G-xxxxxxxxxx",
        "type": "string"
      },
      {
        "flag": "sort",
        "path": "sort",
        "required": false,
        "description": "Sort monitors by friendly name or their statuses. Manual is read-only — a manual order can only be arranged in the dashboard.",
        "enum": [
          "FriendlyNameAsc",
          "FriendlyNameDesc",
          "StatusUpDownPaused",
          "StatusDownUpPaused"
        ],
        "example": "FriendlyNameAsc",
        "type": "string"
      },
      {
        "flag": "status",
        "path": "status",
        "required": false,
        "description": "Send \"ENABLED\" to publish the status page, \"PAUSED\" to un-publish it",
        "enum": [
          "PAUSED",
          "ENABLED"
        ],
        "example": "ENABLED",
        "type": "string"
      },
      {
        "flag": "subscription",
        "path": "subscription",
        "required": false,
        "description": "Subscribers can subscribe to receive announcements via an e-mail.",
        "type": "boolean"
      },
      {
        "flag": "share-analytics-consent",
        "path": "shareAnalyticsConsent",
        "required": false,
        "default": false,
        "description": "Help us improve the Status Pages by sharing the analytics data with us.",
        "type": "boolean"
      },
      {
        "flag": "homepage-link",
        "path": "homepageLink",
        "required": false,
        "default": "https://uptimerobot.com",
        "description": "The link target for the logo (or main title) on status page. Usually leads to your homepage.",
        "maxLength": 255,
        "type": "string"
      },
      {
        "flag": "show-cookie-bar",
        "path": "showCookieBar",
        "required": false,
        "default": false,
        "description": "Available only for a Custom domain status page",
        "type": "boolean"
      },
      {
        "flag": "use-small-cookie-consent-modal",
        "path": "useSmallCookieConsentModal",
        "required": false,
        "description": "Allowing visitor to interact with the page - should not be used on public pages",
        "type": "boolean"
      },
      {
        "flag": "pinned-announcement-id",
        "path": "pinnedAnnouncementId",
        "required": false,
        "type": "number"
      },
      {
        "flag": "custom-settings",
        "path": "customSettings",
        "required": false,
        "properties": {
          "font": {
            "nullable": true,
            "properties": {
              "family": {
                "description": "The font family to use for the PSP. Google fonts are supported.",
                "example": "Roboto",
                "type": "string"
              }
            },
            "type": "object"
          },
          "page": {
            "nullable": true,
            "properties": {
              "layout": {
                "description": "The alignment of the logo on the page",
                "enum": [
                  "LogoOnLeft",
                  "LogoOnCenter"
                ],
                "example": "logo_on_center",
                "type": "string"
              },
              "theme": {
                "description": "The theme of the page",
                "enum": [
                  "Light",
                  "Dark"
                ],
                "example": "light",
                "type": "string"
              },
              "density": {
                "description": "The density of the page",
                "enum": [
                  "Normal",
                  "Compact"
                ],
                "example": "normal",
                "type": "string"
              },
              "showMonitorsUnderGroups": {
                "description": "Group the monitors on the status page home screen under their monitor groups instead of listing them flat. Omit it to keep the current value.",
                "example": false,
                "type": "boolean"
              }
            },
            "type": "object"
          },
          "colors": {
            "description": "The colors of the page",
            "nullable": true,
            "properties": {
              "main": {
                "description": "The main color of the page in hex format",
                "example": "#131a26",
                "type": "string"
              },
              "text": {
                "description": "The text color of the page in hex format",
                "example": "#ffffff",
                "type": "string"
              },
              "link": {
                "description": "The link color of the page in hex format",
                "example": "#3bd671",
                "type": "string"
              }
            },
            "type": "object"
          },
          "features": {
            "nullable": true,
            "properties": {
              "showBars": {
                "description": "Show or hide the bar charts for uptime of a monitor on a status page home screen",
                "example": false,
                "type": "boolean"
              },
              "showUptimePercentage": {
                "description": "Show or hide the uptime percentage of a monitor near the monitor name on a status page home screen",
                "example": false,
                "type": "boolean"
              },
              "enableFloatingStatus": {
                "description": "Enable or disable the floating bar sticked to the bottom with the overall count of up and down monitors",
                "example": false,
                "type": "boolean"
              },
              "showOverallUptime": {
                "description": "Show or hide the overall uptime (last 24 h, last 7 and 30 days) section below monitors list on a status page home screen",
                "example": false,
                "type": "boolean"
              },
              "showOutageUpdates": {
                "description": "Show outage reason details (like status code) to give more explanation for your status page users",
                "example": false,
                "type": "boolean"
              },
              "showOutageDetails": {
                "description": "Show or hide downtimes grouped by day for a specific monitor in the Announcement feed. The latest downtime will be visible in header. This won't hide the events on a details page",
                "example": false,
                "type": "boolean"
              },
              "enableDetailsPage": {
                "description": "Details page contains uptime, response times and up/down event history",
                "example": false,
                "type": "boolean"
              },
              "showMonitorURL": {
                "description": "Show monitor URL and type to give your users more details on your Status page",
                "example": false,
                "type": "boolean"
              },
              "hidePausedMonitors": {
                "description": "Don't display paused monitors on your Status page",
                "example": false,
                "type": "boolean"
              }
            },
            "type": "object"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-font",
        "path": "customSettings.font",
        "required": false,
        "nullable": true,
        "properties": {
          "family": {
            "description": "The font family to use for the PSP. Google fonts are supported.",
            "example": "Roboto",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-font-family",
        "path": "customSettings.font.family",
        "required": false,
        "description": "The font family to use for the PSP. Google fonts are supported.",
        "example": "Roboto",
        "type": "string"
      },
      {
        "flag": "custom-settings-page",
        "path": "customSettings.page",
        "required": false,
        "nullable": true,
        "properties": {
          "layout": {
            "description": "The alignment of the logo on the page",
            "enum": [
              "LogoOnLeft",
              "LogoOnCenter"
            ],
            "example": "logo_on_center",
            "type": "string"
          },
          "theme": {
            "description": "The theme of the page",
            "enum": [
              "Light",
              "Dark"
            ],
            "example": "light",
            "type": "string"
          },
          "density": {
            "description": "The density of the page",
            "enum": [
              "Normal",
              "Compact"
            ],
            "example": "normal",
            "type": "string"
          },
          "showMonitorsUnderGroups": {
            "description": "Group the monitors on the status page home screen under their monitor groups instead of listing them flat. Omit it to keep the current value.",
            "example": false,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-page-layout",
        "path": "customSettings.page.layout",
        "required": false,
        "description": "The alignment of the logo on the page",
        "enum": [
          "LogoOnLeft",
          "LogoOnCenter"
        ],
        "example": "logo_on_center",
        "type": "string"
      },
      {
        "flag": "custom-settings-page-theme",
        "path": "customSettings.page.theme",
        "required": false,
        "description": "The theme of the page",
        "enum": [
          "Light",
          "Dark"
        ],
        "example": "light",
        "type": "string"
      },
      {
        "flag": "custom-settings-page-density",
        "path": "customSettings.page.density",
        "required": false,
        "description": "The density of the page",
        "enum": [
          "Normal",
          "Compact"
        ],
        "example": "normal",
        "type": "string"
      },
      {
        "flag": "custom-settings-page-show-monitors-under-groups",
        "path": "customSettings.page.showMonitorsUnderGroups",
        "required": false,
        "description": "Group the monitors on the status page home screen under their monitor groups instead of listing them flat. Omit it to keep the current value.",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-colors",
        "path": "customSettings.colors",
        "required": false,
        "description": "The colors of the page",
        "nullable": true,
        "properties": {
          "main": {
            "description": "The main color of the page in hex format",
            "example": "#131a26",
            "type": "string"
          },
          "text": {
            "description": "The text color of the page in hex format",
            "example": "#ffffff",
            "type": "string"
          },
          "link": {
            "description": "The link color of the page in hex format",
            "example": "#3bd671",
            "type": "string"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-colors-main",
        "path": "customSettings.colors.main",
        "required": false,
        "description": "The main color of the page in hex format",
        "example": "#131a26",
        "type": "string"
      },
      {
        "flag": "custom-settings-colors-text",
        "path": "customSettings.colors.text",
        "required": false,
        "description": "The text color of the page in hex format",
        "example": "#ffffff",
        "type": "string"
      },
      {
        "flag": "custom-settings-colors-link",
        "path": "customSettings.colors.link",
        "required": false,
        "description": "The link color of the page in hex format",
        "example": "#3bd671",
        "type": "string"
      },
      {
        "flag": "custom-settings-features",
        "path": "customSettings.features",
        "required": false,
        "nullable": true,
        "properties": {
          "showBars": {
            "description": "Show or hide the bar charts for uptime of a monitor on a status page home screen",
            "example": false,
            "type": "boolean"
          },
          "showUptimePercentage": {
            "description": "Show or hide the uptime percentage of a monitor near the monitor name on a status page home screen",
            "example": false,
            "type": "boolean"
          },
          "enableFloatingStatus": {
            "description": "Enable or disable the floating bar sticked to the bottom with the overall count of up and down monitors",
            "example": false,
            "type": "boolean"
          },
          "showOverallUptime": {
            "description": "Show or hide the overall uptime (last 24 h, last 7 and 30 days) section below monitors list on a status page home screen",
            "example": false,
            "type": "boolean"
          },
          "showOutageUpdates": {
            "description": "Show outage reason details (like status code) to give more explanation for your status page users",
            "example": false,
            "type": "boolean"
          },
          "showOutageDetails": {
            "description": "Show or hide downtimes grouped by day for a specific monitor in the Announcement feed. The latest downtime will be visible in header. This won't hide the events on a details page",
            "example": false,
            "type": "boolean"
          },
          "enableDetailsPage": {
            "description": "Details page contains uptime, response times and up/down event history",
            "example": false,
            "type": "boolean"
          },
          "showMonitorURL": {
            "description": "Show monitor URL and type to give your users more details on your Status page",
            "example": false,
            "type": "boolean"
          },
          "hidePausedMonitors": {
            "description": "Don't display paused monitors on your Status page",
            "example": false,
            "type": "boolean"
          }
        },
        "type": "object"
      },
      {
        "flag": "custom-settings-features-show-bars",
        "path": "customSettings.features.showBars",
        "required": false,
        "description": "Show or hide the bar charts for uptime of a monitor on a status page home screen",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-uptime-percentage",
        "path": "customSettings.features.showUptimePercentage",
        "required": false,
        "description": "Show or hide the uptime percentage of a monitor near the monitor name on a status page home screen",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-enable-floating-status",
        "path": "customSettings.features.enableFloatingStatus",
        "required": false,
        "description": "Enable or disable the floating bar sticked to the bottom with the overall count of up and down monitors",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-overall-uptime",
        "path": "customSettings.features.showOverallUptime",
        "required": false,
        "description": "Show or hide the overall uptime (last 24 h, last 7 and 30 days) section below monitors list on a status page home screen",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-outage-updates",
        "path": "customSettings.features.showOutageUpdates",
        "required": false,
        "description": "Show outage reason details (like status code) to give more explanation for your status page users",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-outage-details",
        "path": "customSettings.features.showOutageDetails",
        "required": false,
        "description": "Show or hide downtimes grouped by day for a specific monitor in the Announcement feed. The latest downtime will be visible in header. This won't hide the events on a details page",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-enable-details-page",
        "path": "customSettings.features.enableDetailsPage",
        "required": false,
        "description": "Details page contains uptime, response times and up/down event history",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-show-monitor-url",
        "path": "customSettings.features.showMonitorURL",
        "required": false,
        "description": "Show monitor URL and type to give your users more details on your Status page",
        "example": false,
        "type": "boolean"
      },
      {
        "flag": "custom-settings-features-hide-paused-monitors",
        "path": "customSettings.features.hidePausedMonitors",
        "required": false,
        "description": "Don't display paused monitors on your Status page",
        "example": false,
        "type": "boolean"
      }
    ]
  },
  "tags:delete": {
    "commandId": "tags:delete",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Delete a tag and remove it from all monitors",
    "destructive": true,
    "method": "DELETE",
    "operationId": "TagsController_deleteTag",
    "parameters": [
      {
        "description": "Tag ID to delete",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "number"
      }
    ],
    "path": "/tags/{id}",
    "requestBodyRequired": false,
    "summary": "Delete a tag",
    "tags": [
      "Tags"
    ]
  },
  "tags:list": {
    "commandId": "tags:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get a paginated list of tags for the authenticated user, sorted by ID in ascending order",
    "destructive": false,
    "method": "GET",
    "operationId": "TagsController_getTags",
    "parameters": [
      {
        "description": "Maximum number of tags to return per page. Default: 50, Min: 1, Max: 200.",
        "example": 50,
        "in": "query",
        "maximum": 200,
        "minimum": 1,
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Cursor for pagination",
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "number"
      }
    ],
    "path": "/tags",
    "requestBodyRequired": false,
    "summary": "List user tags",
    "tags": [
      "Tags"
    ]
  },
  "third-party-providers:get": {
    "commandId": "third-party-providers:get",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns one third-party provider by its numeric id, with its current state and its component tree. Components carry their own id, name and status, and list their children.",
    "destructive": false,
    "method": "GET",
    "operationId": "ThirdPartyProvidersController_getById",
    "parameters": [
      {
        "description": "The numeric id of the third-party provider.",
        "example": "7",
        "in": "path",
        "name": "id",
        "required": true,
        "type": "string"
      }
    ],
    "path": "/third-party-providers/{id}",
    "requestBodyRequired": false,
    "summary": "Get a third-party provider",
    "tags": [
      "Third-party providers"
    ]
  },
  "third-party-providers:list": {
    "commandId": "third-party-providers:list",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Search the third-party provider catalog by provider or component name. Each provider is identified by its numeric id, and isTracked tells whether the account already monitors it as a third-party service. Results are cached for a minute, so isTracked can lag by up to a minute after a third-party service is created or deleted.",
    "destructive": false,
    "method": "GET",
    "operationId": "ThirdPartyProvidersController_search",
    "parameters": [
      {
        "description": "Free-text term matched against provider names and their components.",
        "example": "github",
        "in": "query",
        "name": "search",
        "required": true,
        "type": "string"
      }
    ],
    "path": "/third-party-providers",
    "requestBodyRequired": false,
    "summary": "Search third-party providers",
    "tags": [
      "Third-party providers"
    ]
  },
  "user:alert-contacts": {
    "commandId": "user:alert-contacts",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get alert contacts",
    "destructive": false,
    "method": "GET",
    "operationId": "UserController_getAlertContacts",
    "parameters": [],
    "path": "/user/alert-contacts",
    "requestBodyRequired": false,
    "summary": "Get alert contacts",
    "tags": [
      "User"
    ]
  },
  "user:all-alert-contacts": {
    "commandId": "user:all-alert-contacts",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get all alert contacts including personal, notify-only, and organization members alert contacts",
    "destructive": false,
    "method": "GET",
    "operationId": "UserController_getAllAlertContacts",
    "parameters": [],
    "path": "/user/all-alert-contacts",
    "requestBodyRequired": false,
    "summary": "Get all alert contacts",
    "tags": [
      "User"
    ]
  },
  "user:me": {
    "commandId": "user:me",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Get current user",
    "destructive": false,
    "method": "GET",
    "operationId": "UserController_getMe",
    "parameters": [],
    "path": "/user/me",
    "requestBodyRequired": false,
    "summary": "Get current user",
    "tags": [
      "User"
    ]
  }
} as const satisfies Record<string, OperationDefinition>;
