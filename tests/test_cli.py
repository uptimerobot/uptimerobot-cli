from __future__ import absolute_import, division, print_function, unicode_literals

import sys, os

from pytest import raises
from flexmock import flexmock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from uptimerobot import parse_cli_args, Client

class TestCli(object):
    def setup(self):
        self.client = flexmock(Client)



###################################################################
# Monitors

class TestGetMonitor(TestCli):
    def test_get_monitors(self):
        self.client.should_receive("get_monitors").with_args(ids=None)
        parse_cli_args("get-monitors".split(" "))


    def test_get_monitors_list(self):
        self.client.should_receive("get_monitors").with_args(ids=[15830, 32696, 83920])
        parse_cli_args("get-monitors --ids 15830 32696 83920".split(" "))


    def test_get_monitors_bad_id(self):
        with raises(SystemExit):
            parse_cli_args("get-monitors --ids fred".split(" "))


class TestNewMonitor(TestCli):
    def test_new_monitor(self):
        self.client.should_receive("new_monitor").with_args(name="fishy", url="http://fish.com", type=2)
        parse_cli_args("new-monitor fishy http://fish.com 2".split(" "))


    def test_new_monitor_no_args(self):
        with raises(SystemExit):
            parse_cli_args("new-monitor".split(" "))


class TestEditMonitor(TestCli):
    def test_edit_monitor(self):
        self.client.should_receive("edit_monitor").with_args(id=1234)
        parse_cli_args("edit-monitor 1234".split(" "))


    def test_edit_monitor_no_args(self):
        with raises(SystemExit):
            parse_cli_args("edit-monitor".split(" "))


class TestDeleteMonitor(TestCli):
    def test_delete_monitor(self):
        self.client.should_receive("delete_monitor").with_args(id=1234)
        parse_cli_args("delete-monitor 1234".split(" "))


    def test_delete_monitor_bad_id(self):
        with raises(SystemExit):
            parse_cli_args("delete-monitor fred".split(" "))


    def test_delete_monitor_no_id(self):
        with raises(SystemExit):
            parse_cli_args("delete-monitor".split(" "))



##################################################################
# Alerts

class TestGetAlerts(TestCli):
    def test_get_alerts(self):
        self.client.should_receive("get_alert_contacts").with_args(ids=None)
        parse_cli_args("get-alerts".split(" "))


    def test_get_alerts_list(self):
        self.client.should_receive("get_alert_contacts").with_args(ids=[236, 1782, 4790])
        parse_cli_args("get-alerts --ids 236 1782 4790".split(" "))


    def test_get_alerts_bad_contacts(self):
        with raises(SystemExit):
            parse_cli_args("get-alerts --ids fred".split(" "))



class TestNewAlert(TestCli):
    def test_delete_alert(self):
        self.client.should_receive("new_alert_contact").with_args(type=2,value="uptime@webresourcesdepot.com")
        parse_cli_args("new-alert 2 uptime@webresourcesdepot.com".split(" "))


    def test_delete_alert_bad(self):
        with raises(SystemExit):
            parse_cli_args("new-alert uptime@webresourcesdepot.com 2".split(" "))


    def test_delete_alert_no_args(self):
        with raises(SystemExit):
            parse_cli_args("new-alert".split(" "))


class TestDeleteAlert(TestCli):
    def test_delete_alert(self):
        self.client.should_receive("delete_alert_contact").with_args(id=1234)
        parse_cli_args("delete-alert 1234".split(" "))


    def test_delete_alert_bad_id(self):
        with raises(SystemExit):
            parse_cli_args("delete-alert fred".split(" "))


    def test_delete_alert_no_id(self):
        with raises(SystemExit):
            parse_cli_args("delete-alert".split(" "))