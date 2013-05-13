from __future__ import absolute_import, division, print_function, unicode_literals

import re
import sys
import json

import requests

from . import APIError, HTTPError
from .monitor import Monitor
from .alert_contact import AlertContact

# Ensure that we can test against the appropriate string types.
if sys.version_info < (3, 0):
    string = basestring
else:
    string = (str, bytes)


class Client(object):
    """An uptimerobot API client"""


    URL = "http://api.uptimerobot.com/"
    LIST_SEPARATOR = "-"
    ID_PATTERN = "^\d+$"


    def __init__(self, api_key):
        self.api_key = api_key


    def get(self, action, **values):
        payload = {
            "apiKey": self.api_key,
            "format": "json",
            "noJsonCallback": 1,
        }

        payload.update(values)

        response = requests.get(self.URL + action, params=payload)

        # Handle client/server errors with the request.
        if response.status_code != requests.codes.ok:
            try:
                raise response.raise_for_status()
            except Exception as ex:
                raise HTTPError(ex)

        # Parse the json in the correct response.
        data = json.loads(response.text)

        # Request went through, but was bad in some way.
        if data["stat"] == "fail":
            raise APIError(data["message"])

        return data


    def get_monitors(self, ids=None, show_logs=False,
                     show_log_alert_contacts=False,
                     show_alert_contacts=False,
                     custom_uptime_ratio=False,
                     show_log_timezone=False):
        """
        Args
            ids
                IDs of the monitors to list. If None, then get all contacts. [list<int>]
            logs
                Show logs [Boolean]
            alert_contacts
                Show alert contacts [Boolean]
            show_monitor_alert_contacts
                Show monitors alert contacts [Boolean]
            custom_uptime_ratio
                Number of days to calculate uptime over [list<int>]
            show_log_timezone
                Show the timezone for the log times [Boolean]

        Returns
            List of Monitor detail objects.

        """

        variables = {}

        if ids:
            if any(not isinstance(id, string) for id in ids):
                raise TypeError("ids must be strings")

            if any(not re.match(self.ID_PATTERN, id) for id in ids):
                raise ValueError("ids must be numeric")

            variables["monitors"] = self.LIST_SEPARATOR.join(ids)

        if show_logs:
            variables["logs"] = "1"

            if show_log_timezone:
                variables["showTimezone"] = "1"

            if show_log_alert_contacts:
                variables["alertContacts"] = "1"

        if show_alert_contacts:
            variables["showMonitorAlertContacts"] = "1"

        if custom_uptime_ratio:
            if not all(isinstance(n, int) and n > 0 for n in custom_uptime_ratio):
                raise TypeError("custom_uptime_ratio must be a list of positive integers")

            variables["customUptimeRatio"] = self.LIST_SEPARATOR.join(str(n) for n in custom_uptime_ratio)
        

        data = self.get("getMonitors", **variables)

        monitors = [Monitor(mon, custom_uptime_ratio) for mon in data["monitors"]["monitor"]]

        return monitors


    def new_monitor(self, name, url, type,
                    subtype=None,
                    port=None,
                    keyword_type=None,
                    keyword=None,
                    username=None,
                    password=None,
                    alert_contacts=None):
        """
        Args
            name
                Human-readable name to assign to the monitor [str].
            url
                URL [str]
            type
                Monitor type [int]
            subtype
                subtype of the monitor [int]
            keyword_type
                Type of keyword to use (requires keyword be set) [int]
            keyword
                Keyword to use (requires keyword_type be set)
            http_username
                Username to use for private site (requires http_password be set)
            http_password
                Password to use for private site (requires http_username be set)
            alert_contacts
                Alert contacts to give the monitor [list<int>]

        Returns
            ID of monitor created.

        """

        if type not in Monitor.TYPES:
                raise ValueError("type must be one of %s" % ", ".join(str(m) for m in Monitor.TYPES.keys()))

        variables = {
            "monitorFriendlyName": name,
            "monitorURL": url,
            "monitorType": str(type),
        }

        if subtype:
            if subtype not in Monitor.SUBTYPES:
                raise ValueError("subtype must be one of %s" % ", ".join(str(m) for m in Monitor.SUBTYPES.keys()))

            variables["monitorSubType"] = str(subtype)

        if port:
            variables["monitorPort"] = str(port)

        if keyword_type and keyword:
            if keyword_type not in Monitor.KEYWORD_TYPES:
                raise ValueError("keyword_type must be one of %s" % ", ".join(str(m) for m in Monitor.KEYWORD_TYPES.keys()))

            variables["monitorKeywordType"] = str(keyword_type)
            variables["monitorKeywordValue"] = keyword
        elif keyword_type or keyword:
            raise ValueError("Requires both keyword_type and keyword if either are specified")

        if username and password:
            variables["monitorHTTPUsername"] = username
            variables["monitorHTTPPassword"] = password
        elif username or password:
            raise ValueError("Requires both username and password if either are specified")

        if alert_contacts:
            if any(not isinstance(id, string) for id in alert_contacts):
                raise TypeError("alert_contacts must be strings")

            if any(not re.match(self.ID_PATTERN, id) for id in alert_contacts):
                raise ValueError("alert_contacts must be numeric")

            variables["monitorAlertContacts"] = self.LIST_SEPARATOR.join(alert_contacts)

        data = self.get("newMonitor", **variables)

        return data["monitor"]["id"]


    def edit_monitor(self, id,
                    status=None,
                    name=None,
                    url=None,
                    type=None,
                    subtype=None,
                    port=None,
                    keyword_type=None,
                    keyword=None,
                    username=None,
                    password=None,
                    alert_contacts=None):
        """
        Args
            id
                ID number of the monitor to edit [str]
            status
                Status to set [int]
            name
                Human-readable name to assign to the monitor.
            url
                URL to monitor
            type
                Monitor type [int]
            subtype
                subtype of the monitor [int]
            keyword_type
                Type of keyword to use (requires keyword be set) [int]
            keyword
                Keyword to use (requires keyword_type be set)
            username
                Username to use for private site (requires http_password be set)
            password
                Password to use for private site (requires http_username be set)
            alert_contacts
                Alert contacts to give the monitor [list<int>]

        Returns
            ID of monitor edited.

        """

        if not isinstance(id, string):
            raise TypeError("id must be a string")

        if not re.match(self.ID_PATTERN, id):
            raise ValueError("id must be numeric")

        variables = {
            "monitorID": id,
        }

        if status:
            if type not in Monitor.STATUSES:
                raise ValueError("status must be one of %s" % ", ".join(str(m) for m in Monitor.STATUSES.keys()))

            variables["monitorStatus"] = str(status)

        if name:
            variables["monitorFriendlyName"] = name

        if url:
            variables["monitorURL"] = url

        if type:
            if type not in Monitor.TYPES:
                raise ValueError("type must be one of %s" % ", ".join(str(m) for m in Monitor.TYPES.keys()))

            variables["monitorType"] = str(type)

        if subtype:
            if subtype not in Monitor.SUBTYPES:
                raise ValueError("subtype must be one of %s" % ", ".join(str(m) for m in Monitor.SUBTYPES.keys()))

            variables["monitorSubType"] = str(subtype)

        if port:
            variables["monitorPort"] = str(port)

        if keyword_type:
            if keyword_type not in Monitor.KEYWORD_TYPES:
                raise ValueError("keyword_type must be one of %s" % ", ".join(str(m) for m in Monitor.KEYWORD_TYPES.keys()))

            variables["monitorKeywordType"] = str(keyword_type)

        if keyword:
            variables["monitorKeywordValue"] = keyword

        if username:
            variables["monitorHTTPUsername"] = username

        if password:
            variables["monitorHTTPPassword"] = password

        if alert_contacts:
            if any(not isinstance(id, string) for id in alert_contacts):
                raise TypeError("alert_contacts must be strings")

            if any(not re.match(self.ID_PATTERN, id) for id in alert_contacts):
                raise ValueError("alert_contacts must be numeric")

            variables["monitorAlertContacts"] = self.LIST_SEPARATOR.join(alert_contacts)


        data = self.get("editMonitor", **variables)

        return data["monitor"]["id"]


    def delete_monitor(self, id):
        """
        Args
            id
                ID of the monitor to delete [str]

        Returns
            ID of monitor deleted [str]

        """

        if not isinstance(id, string):
            raise TypeError("id must be a string")

        if not re.match(self.ID_PATTERN, id):
            raise ValueError("id must be numeric")

        data = self.get("deleteMonitor", monitorID=id)

        return data["monitor"]["id"]


    def get_alert_contacts(self, ids=None):
        """
        Args
            ids
                IDs of the alert contacts to list. If None, then get all contacts [list.

        Returns
            List of AlertContact detail objects.

        """

        variables = {}

        if ids is not None:
            if any(not isinstance(id, string) for id in ids):
                raise TypeError("ids must be strings")

            if any(not re.match(self.ID_PATTERN, id) for id in ids):
                raise ValueError("ids must be numeric")

            variables["alertcontacts"] = self.LIST_SEPARATOR.join(ids)

        data = self.get("getAlertContacts", **variables)
        
        alerts = [AlertContact(ac) for ac in data["alertcontacts"]["alertcontact"]]

        return alerts


    def new_alert_contact(self, type, value):
        """
        Args
            type
                Type of the new alert to create [int]
            value
                email address (or ) to alert [str]

        Returns
            ID of alert contact created [str]

        """

        if type not in AlertContact.TYPES:
            raise ValueError("type must be one of %s" % ", ".join(str(t) for t in AlertContact.TYPES))

        if not isinstance(value, string):
            raise TypeError("value must be a string")

        data = self.get("newAlertContact", alertContactType=str(type), alertContactValue=value)

        return data["alertcontact"]["id"]


    def delete_alert_contact(self, id):
        """
        Args
            id
                ID of the alert contact to delete [str]

        Returns
            ID of alert contact deleted [str]

        """

        if not isinstance(id, string):
            raise TypeError("id must be a string")

        if not re.match(self.ID_PATTERN, id):
            raise ValueError("id must be numeric")

        data = self.get("deleteAlertContact", alertContactID=id)

        return data["alertcontact"]["id"]