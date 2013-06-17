from __future__ import absolute_import, division, print_function, unicode_literals

import sys, os
import json

import requests
from pytest import raises
from flexmock import flexmock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from uptimerobot import Client, APIError, HTTPError

from uptimerobot.monitor import Monitor
from uptimerobot.log import Log
from uptimerobot.alert_contact import AlertContact


class TestClient(object):
    API_KEY = "u956-afus321g565fghr519"

    def setup(self):
        self.client = Client(self.API_KEY)


    def response(self, name):
        filename = os.path.join(os.path.dirname(__file__), "data", "%s.json" % name)
        with open(filename) as f:
            return json.load(f)


###########################################################
# Monitors

class TestGetMonitors(TestClient):
    def test_get_all_monitors(self):
        flexmock(self.client).should_receive("get").with_args("getMonitors").and_return(self.response("get_monitors"))
        monitors = self.client.get_monitors()

        assert len(monitors) == 2
        assert all(isinstance(monitor, Monitor) for monitor in monitors)
        assert [monitor.id for monitor in monitors] == ["128795", "128796"]


    def test_get_specific_monitors(self):
        flexmock(self.client).should_receive("get").with_args("getMonitors", monitors="128795-128796").and_return(self.response("get_monitors"))
        monitors = self.client.get_monitors(ids=["128795", "128796"])

        assert all(isinstance(monitor, Monitor) for monitor in monitors)
        assert [monitor.id for monitor in monitors] == ["128795", "128796"]


    def test_get_all_monitors_all_options(self):
        flexmock(self.client).should_receive("get").with_args("getMonitors", customUptimeRatio="1-2-3", logs="1", alertContacts="1", showMonitorAlertContacts="1", showTimezone="1").and_return(self.response("get_monitors"))
        monitors = self.client.get_monitors(show_logs=True, show_alert_contacts=True, show_log_alert_contacts=True, show_log_timezone=True, custom_uptime_ratio=[1, 2, 3])

        assert len(monitors) == 2
        assert all(isinstance(monitor, Monitor) for monitor in monitors)
        assert [monitor.id for monitor in monitors] == ["128795", "128796"]


    def test_bad_monitors_integer(self):
        with raises(TypeError):
            self.client.get_monitors(ids=[128795])


    def test_bad_monitors_not_numeric(self):
        with raises(ValueError):
            self.client.get_monitors(ids=["fred"])


    def test_bad_monitors_not_ierable(self):
        with raises(TypeError):
            self.client.get_monitors(ids=12344)


    def test_bad_custom_ratio_negative(self):
        with raises(TypeError):
            self.client.get_monitors(custom_uptime_ratio=[-1])


    def test_bad_custom_ratio_type(self):
        with raises(TypeError):
            self.client.get_monitors(custom_uptime_ratio=["5"])


    def test_bad_custom_ratio_non_iterable(self):
        with raises(TypeError):
            self.client.get_monitors(custom_uptime_ratio=5)


class TestNewMonitor(TestClient):
    def test_new_monitor(self):
        flexmock(self.client).should_receive("get").with_args("newMonitor", monitorFriendlyName="fred", monitorURL="http://x.y", monitorType="2").and_return(self.response("new_monitor"))
        new_id = self.client.new_monitor(name="fred", url="http://x.y", type=2)
        assert new_id == "128798"


    def test_username_and_no_password(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, username="fred")


    def test_password_and_no_username(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, password="fred")


    def test_keyword_and_no_keyword_type(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, keyword="fred")


    def test_keyword_type_and_no_keyword(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, keyword_type=1)

    def test_bad_type(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=200)

    def test_bad_type(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, subtype=200)


    def test_bad_keyword_type(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, keyword_type=100, keyword="fred")


    def test_bad_alerts_integer(self):
        with raises(TypeError):
            self.client.new_monitor(name="fred", url="abc", type=2, alert_contacts=[128795])


    def test_bad_alerts_not_numeric(self):
        with raises(ValueError):
            self.client.new_monitor(name="fred", url="abc", type=2, alert_contacts=["fred"])


    def test_bad_alerts_not_ierable(self):
        with raises(TypeError):
            self.client.new_monitor(name="fred", url="abc", type=2, alert_contacts=12344)


class TestEditMonitor(TestClient):
    def test_edit_monitor(self):
        flexmock(self.client).should_receive("get").with_args("editMonitor", monitorID="128798").and_return(self.response("edit_monitor"))
        edited_id = self.client.edit_monitor(id="128798")
        assert edited_id == "128798"

    def test_edit_monitor_with_status_1(self):
        flexmock(self.client).should_receive("get").with_args("editMonitor", monitorID="128798", monitorStatus="1").and_return(self.response("edit_monitor"))
        edited_id = self.client.edit_monitor(id="128798", status=1)
        assert edited_id == "128798"

    def test_edit_monitor_with_status_0(self):
        flexmock(self.client).should_receive("get").with_args("editMonitor", monitorID="128798", monitorStatus="0").and_return(self.response("edit_monitor"))
        edited_id = self.client.edit_monitor(id="128798", status=0)
        assert edited_id == "128798"


    def test_bad_id_non_numeric(self):
        with raises(ValueError):
            self.client.edit_monitor(id="fred")


    def test_bad_id_integer(self):
        with raises(TypeError):
            self.client.edit_monitor(id=123)


    def test_bad_type(self):
        with raises(ValueError):
            self.client.edit_monitor(id="1234", type=200)


    def test_bad_type(self):
        with raises(ValueError):
            self.client.edit_monitor(id="1234", subtype=200)


    def test_bad_status(self):
        with raises(ValueError):
            self.client.edit_monitor(id="1234", status=200)


    def test_bad_keyword_type(self):
        with raises(ValueError):
            self.client.edit_monitor(id="1234", keyword_type=100, keyword="fred")


    def test_bad_alerts_integer(self):
        with raises(TypeError):
            self.client.edit_monitor(id="1234", alert_contacts=[128795])


    def test_bad_alerts_not_numeric(self):
        with raises(ValueError):
            self.client.edit_monitor(id="1234", alert_contacts=["fred"])


    def test_bad_alerts_not_ierable(self):
        with raises(TypeError):
            self.client.edit_monitor(id="1234", alert_contacts=12344)


class TestDeleteMonitor(TestClient):
    def test_delete_monitor(self):
        flexmock(self.client).should_receive("get").with_args("deleteMonitor", monitorID="128798").and_return(self.response("delete_monitor"))
        deleted_id = self.client.delete_monitor(id="128798")
        assert deleted_id == "128798"


    def test_bad_id_non_numeric(self):
        with raises(ValueError):
            self.client.delete_monitor(id="fred")


    def test_bad_id_integer(self):
        with raises(TypeError):
            self.client.delete_monitor(id=123)


###########################################################
# Alert Contacts

class TestGetAlertContacts(TestClient):
    def test_all_contacts(self):
        flexmock(self.client).should_receive("get").with_args("getAlertContacts").and_return(self.response("get_alert_contacts"))
        contacts = self.client.get_alert_contacts()

        assert all(isinstance(contact, AlertContact) for contact in contacts)
        assert [contact.id for contact in contacts] == ["236", "237"]


    def test_specific_contacts(self):
        flexmock(self.client).should_receive("get").with_args("getAlertContacts", alertcontacts="236-237").and_return(self.response("get_alert_contacts"))
        contacts = self.client.get_alert_contacts(ids=["236", "237"])

        assert all(isinstance(contact, AlertContact) for contact in contacts)
        assert [contact.id for contact in contacts] == ["236", "237"]
 

    def test_bad_contacts_integer(self):
        with raises(TypeError):
            self.client.get_alert_contacts(ids=[236])


    def test_bad_contacts_not_numeric(self):
        with raises(ValueError):
            monitors = self.client.get_alert_contacts(ids=["fred"])


    def test_bad_contacts_not_ierable(self):
        with raises(TypeError):
            monitors = self.client.get_alert_contacts(ids=12344)


class TestNewAlertContact(TestClient):
    def test_standard(self):
        flexmock(self.client).should_receive("get").with_args("newAlertContact", alertContactType="2", alertContactValue="uptime@webresourcesdepot.com").and_return(self.response("new_alert_contact"))
        new_id = self.client.new_alert_contact(type=2, value="uptime@webresourcesdepot.com")
        assert new_id == "4561"


    def test_bad_type_value(self):
        with raises(ValueError):
            self.client.new_alert_contact(type=10, value="uptime@webresourcesdepot.com")


    def test_bad_value_type(self):
        with raises(TypeError):
            self.client.new_alert_contact(type=2, value=2)


class TestDeleteAlertContact(TestClient):
    def test_standard(self):
        flexmock(self.client).should_receive("get").with_args("deleteAlertContact", alertContactID="236").and_return(self.response("delete_alert_contact"))
        deleted_id = self.client.delete_alert_contact(id="236")
        assert deleted_id == "236"


    def test_bad_id_non_numeric(self):
        with raises(ValueError):
            self.client.delete_alert_contact(id="fred")

    def test_bad_id_integer(self):
        with raises(TypeError):
            self.client.delete_alert_contact(id=123)

    