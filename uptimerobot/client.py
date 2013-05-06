from __future__ import absolute_import, division, print_function, unicode_literals

import requests
import yaml
import json

from . import APIError, HTTPError
from .monitor import Monitor
from .alert_contact import AlertContact


class Client(object):
    """An uptimerobot API client"""


    URL = "http://api.uptimerobot.com/"
    LIST_SEPARATOR = "-"


    def __init__(self, api_key=None):
        if api_key is None:
            with open("uptimerobot.yml") as f:
                self.api_key = yaml.load(f)['api_key']
        else:
            self.api_key = api_key


    def get(self, action, **values):
        payload = {
            "apiKey": self.api_key,
            "format": "json",
            "noJsonCallback": 1,
        }

        payload.update(values)

        response = requests.get(self.URL + action, data=json.dumps(payload))
        
        # Handle client/server errors with the request.
        if response.status_code != requests.codes.ok:
            try:
                raise response.raise_for_status()
            except Exception as ex:
                raise HTTPError(ex)

        # Parse the json in the correct response.
        return json.loads(response.text)


    def get_monitors(self, ids=None):
        """
        Args
            ids
                IDs of the monitors to list. If None, then get all contacts.

        Returns
            List of Monitor detail objects.

        """

        variables = {}

        if ids is not None:
            variables["monitors"] = self.LIST_SEPARATOR.join(str(id) for id in ids)

        data = self.get("getMonitors", **variables)

        monitors = [Monitor(mon) for mon in data["monitors"]["monitor"]]

        return monitors


    def new_monitor(self, friendly_name, url, type):
        """
        Args
            friendly_name
                Human-readable name to assign to the monitor.
            url
                URL
            type
                Monitor type

        Returns
            ID of monitor created.

        """

        variables = {
            "monitorFriendlyName": friendly_name,
            "monitorURL": url,
            "monitorType": str(type),
        }

        data = self.get("newMonitor", **variables)

        return int(data["monitor"]["id"])


    def edit_monitor(self, id):
        """
        Args
            id
                ID number of the monitor to edit

        Returns
            ID of monitor edited.

        """

        variables = {
            "monitorID": str(id),
        }

        data = self.get("editMonitor", **variables)

        return int(data["monitor"]["id"])


    def delete_monitor(self, id):
        """
        Args
            id
                ID of the monitor to delete

        Returns
            ID of monitor deleted.

        """

        data = self.get("deleteMonitor", monitorID=str(id))

        return int(data["monitor"]["id"])


    def get_alert_contacts(self, ids=None):
        """
        Args
            ids
                IDs of the alert contacts to list. If None, then get all contacts.

        Returns
            List of AlertContact detail objects.

        """

        variables = {}

        if ids is not None:
            variables["alertcontacts"] = self.LIST_SEPARATOR.join(str(id) for id in ids)

        data = self.get("getAlertContacts", **variables)
        
        contacts = [AlertContact(ac) for ac in data["alertcontacts"]["alertcontact"]]

        return contacts


    def new_alert_contact(self, type, value):
        """
        Args
            type
                Type of the new alert to create.
            value
                email address to alert.

        Returns
            ID of alert contact created.

        """

        data = self.get("newAlertContact", alertContactType=str(type), alertContactValue=value)

        return int(data["alertcontact"]["id"])


    def delete_alert_contact(self, id):
        """
        Args
            id
                ID of the alert contact to delete

        Returns
            ID of alert contact deleted.

        """

        data = self.get("deleteAlertContact", alertContactID=str(id))

        return int(data["alertcontact"]["id"])