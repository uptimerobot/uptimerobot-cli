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
    ]
  },
  "incidents:activity-log": {
    "commandId": "incidents:activity-log",
    "contentTypes": [],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Returns the activity log for an incident, including status updates, comments, and notifications. Sorted by date descending.",
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
    "description": "Returns all alerts that were sent for a specific incident, including recipient information and delivery status.",
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
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      },
      {
        "description": "Number of comments to return (1-100, default 50)",
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
        "in": "query",
        "name": "cursor",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents by monitor ID",
        "in": "query",
        "minimum": 1,
        "name": "monitor_id",
        "required": false,
        "type": "number"
      },
      {
        "description": "Filter incidents by monitor name (partial match)",
        "in": "query",
        "name": "monitor_name",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents started after this date (ISO 8601 format)",
        "in": "query",
        "name": "started_after",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter incidents started before this date (ISO 8601 format)",
        "in": "query",
        "name": "started_before",
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
    ]
  },
  "monitors:create": {
    "commandId": "monitors:create",
    "contentTypes": [
      "application/json"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "New monitors of any type can be created using this endpoint.",
    "destructive": false,
    "method": "POST",
    "operationId": "MonitorsController_create",
    "parameters": [],
    "path": "/monitors",
    "requestBodyRequired": true,
    "summary": "Create a monitor",
    "tags": [
      "Monitors"
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
        "in": "query",
        "itemType": "string",
        "name": "customField",
        "required": false,
        "type": "array"
      },
      {
        "description": "Maximum number of monitors to return per page. Default: 50, Min: 1, Max: 200.",
        "in": "query",
        "name": "limit",
        "required": false,
        "type": "number"
      },
      {
        "description": "Filter monitors by monitor group ID.",
        "in": "query",
        "name": "groupId",
        "required": false,
        "type": "number"
      },
      {
        "description": "Comma-separated list of status values to filter monitors. Uses OR logic (matches any specified status). Case-insensitive. Allowed values: PAUSED, STARTED, UP, LOOKS_DOWN, DOWN.",
        "in": "query",
        "name": "status",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter monitors by name. Case-insensitive partial match on the monitor friendly name.",
        "in": "query",
        "name": "name",
        "required": false,
        "type": "string"
      },
      {
        "description": "Filter monitors by URL. Case-insensitive partial match on the monitor URL.",
        "in": "query",
        "name": "url",
        "required": false,
        "type": "string"
      },
      {
        "description": "Comma-separated list of tag names to filter monitors. Uses OR logic (matches any specified tag). Case-sensitive.",
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
        "in": "query",
        "name": "from",
        "required": false,
        "type": "string"
      },
      {
        "description": "End date for statistics (ISO 8601 format). Defaults to now.",
        "in": "query",
        "name": "to",
        "required": false,
        "type": "string"
      },
      {
        "description": "Whether to include time series data points in the response. Defaults to false.",
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
        "in": "query",
        "name": "from",
        "required": false,
        "type": "string"
      },
      {
        "description": "End date for statistics (ISO 8601 format). Defaults to now.",
        "in": "query",
        "name": "to",
        "required": false,
        "type": "string"
      },
      {
        "description": "Whether to include time series data points in the response. Defaults to false.",
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
        "in": "query",
        "name": "from",
        "required": false,
        "type": "string"
      },
      {
        "description": "End date for statistics (ISO 8601 format). Defaults to now.",
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
        "description": "Maximum number of log entries to return (1-500).",
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
    ]
  },
  "status-pages:create": {
    "commandId": "status-pages:create",
    "contentTypes": [
      "multipart/form-data"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Create a Public Status Page. Use multipart/form-data content type when uploading a logo.",
    "destructive": false,
    "method": "POST",
    "operationId": "PspController_create",
    "parameters": [],
    "path": "/psps",
    "requestBodyRequired": true,
    "summary": "Create a PSP",
    "tags": [
      "Public Status Pages"
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
      "multipart/form-data"
    ],
    "defaultApiUrl": "https://api.uptimerobot.com/v3",
    "description": "Update a Public Status Page. Use multipart/form-data content type when uploading a logo or icon.",
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
