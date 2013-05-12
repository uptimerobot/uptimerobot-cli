from __future__ import absolute_import, division, print_function, unicode_literals

import sys, os

from pytest import raises
from flexmock import flexmock
from termcolor import colored

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from uptimerobot import Client, APIError
from uptimerobot.cli import parse_cli_args

class TestCli(object):
    def setup(self):
        self.client = flexmock(Client)




###################################################################
# Monitors

class TestGetMonitor(TestCli):
    LINE = colored("-" * 20, 'blue')


    def test_get_monitors(self, capsys):
        result = [flexmock(dump=lambda: print("monitor"))] * 3
        self.client.should_receive("get_monitors").with_args(show_logs=False, show_alert_contacts=False, ids=None, show_log_timezone=False, show_log_alert_contacts=False, custom_uptime_ratio=None).and_return(result)
        parse_cli_args("get-monitors".split(" "))
        out, err = capsys.readouterr()
        assert out == ("monitor\n%s\n\n" % self.LINE) * 3


    def test_get_monitors_by_ids(self, capsys):
        result = [flexmock(dump=lambda: print("monitor"))] * 3
        self.client.should_receive("get_monitors").with_args(show_logs=False, show_alert_contacts=False, ids=['15830', '32696', '83920'], show_log_timezone=False, show_log_alert_contacts=False, custom_uptime_ratio=None).and_return(result)
        parse_cli_args("get-monitors --monitors 15830 32696 83920".split(" "))
        out, err = capsys.readouterr()
        assert out == ("monitor\n%s\n\n" % self.LINE) * 3


    def test_get_monitors_by_names(self, capsys):
        monitor = flexmock(id="1234", name="fred", dump=lambda: print("monitor fred"))
        self.client.should_receive("get_monitors").with_args().and_return([monitor])

        self.client.should_receive("get_monitors").with_args(show_logs=False, show_alert_contacts=False, ids=['1234'], show_log_timezone=False, show_log_alert_contacts=False, custom_uptime_ratio=None).and_return([monitor])

        parse_cli_args("get-monitors --monitors fred".split(" "))
        out, err = capsys.readouterr()
        assert out == "monitor fred\n%s\n\n" % self.LINE


class TestNewMonitor(TestCli):
    def test_new_monitor(self, capsys):
        self.client.should_receive("new_monitor").with_args(name="fishy", url="http://fish.com", type=1, alert_contacts=None, subtype=None, port=None, keyword=None, keyword_type=None, username=None, password=None).and_return(999)
        parse_cli_args("new-monitor fishy http://fish.com".split(" "))
        out, err = capsys.readouterr()
        assert out == "Created monitor with id: 999\n"


    def test_new_monitor_all_args(self, capsys):
        self.client.should_receive("new_monitor").with_args(name="fishy", url="http://fish.com", type=2, alert_contacts=["1","2"], subtype=1, port=80, keyword="fish", keyword_type=1, username="user", password="pass").and_return(999)
        parse_cli_args("new-monitor fishy http://fish.com --type 2 --alerts 1 2 --subtype 1 --port 80 --keyword fish --keyword-type 1 --username user --password pass".split(" "))
        out, err = capsys.readouterr()
        assert out == "Created monitor with id: 999\n"


    def test_new_monitor_no_args(self):
        with raises(SystemExit):
            parse_cli_args("new-monitor".split(" "))


class TestEditMonitor(TestCli):
    def test_edit_monitor(self, capsys):
        self.client.should_receive("edit_monitor").with_args(id="1234", status=None, name=None, url=None, alert_contacts=None, type=None, subtype=None, port=None, keyword=None, keyword_type=None, username=None, password=None).and_return(1234)
        parse_cli_args("edit-monitor 1234".split(" "))
        out, err = capsys.readouterr()
        assert out == "Edited monitor with id: 1234\n"


    def test_edit_monitor_all_args(self, capsys):
        self.client.should_receive("edit_monitor").with_args(id="1234", status=1, name="fishy", url="http://fish.com", alert_contacts=["1", "2"], type=2, subtype=1, port=80, keyword="fish", keyword_type=1, username="user", password="pass").and_return(1234)
        parse_cli_args("edit-monitor 1234 --name fishy --url http://fish.com --type 2 --status 1 --alerts 1 2 --subtype 1 --port 80 --keyword fish --keyword-type 1 --username user --password pass".split(" "))
        out, err = capsys.readouterr()
        assert out == "Edited monitor with id: 1234\n"


    def test_edit_monitor_no_args(self):
        with raises(SystemExit):
            parse_cli_args("edit-monitor".split(" "))


class TestDeleteMonitor(TestCli):
    def test_delete_monitor_by_id(self, capsys):
        self.client.should_receive("delete_monitor").with_args(id="1234").and_return(1234)
        parse_cli_args("delete-monitor 1234".split(" "))
        out, err = capsys.readouterr()
        assert out == "Deleted monitor with id: 1234\n"


    def test_delete_monitor_by_name(self, capsys):
        monitor = flexmock(id="1234", name="fred")
        self.client.should_receive("get_monitors").with_args().and_return([monitor])

        self.client.should_receive("delete_monitor").with_args(id="1234").and_return(1234)

        parse_cli_args("delete-monitor fred".split(" "))
        out, err = capsys.readouterr()
        assert out == "Deleted monitor with id: 1234\n"


    def test_delete_monitor_bad_name(self):
        monitor = flexmock(id="1234", name="romy")
        self.client.should_receive("get_monitors").with_args().and_return([monitor])
        with raises(APIError):
            parse_cli_args("delete-monitor fred".split(" "))


    def test_delete_monitor_no_id(self):
        with raises(SystemExit):
            parse_cli_args("delete-monitor".split(" "))



##################################################################
# Alerts

class TestGetAlerts(TestCli):
    def test_get_alerts(self, capsys):
        alert = flexmock(dump=lambda: print("alert"))
        self.client.should_receive("get_alert_contacts").with_args(ids=None).and_return([alert])
        parse_cli_args("get-alerts".split(" "))
        out, err = capsys.readouterr()
        assert out == "alert\n"


    def test_get_alerts_ids(self, capsys):
        alert = flexmock(dump=lambda: print("alert"))
        self.client.should_receive("get_alert_contacts").with_args(ids=["236", "1782", "4790"]).and_return([alert])
        parse_cli_args("get-alerts --alerts 236 1782 4790".split(" "))
        out, err = capsys.readouterr()
        assert out == "alert\n"


    def test_get_alerts_values(self, capsys):
        alert = flexmock(id="1234", value="fred", dump=lambda: print("alert fred"))
        self.client.should_receive("get_alert_contacts").with_args().and_return([alert])

        self.client.should_receive("get_alert_contacts").with_args(ids=["1234"]).and_return([alert])
        parse_cli_args("get-alerts --alerts fred".split(" "))
        out, err = capsys.readouterr()
        assert out == "alert fred\n"


    def test_get_alerts_bad_values(self):
        self.client.should_receive("get_alert_contacts").with_args().and_return([])

        with raises(APIError):
            parse_cli_args("get-alerts --alerts fred".split(" "))



class TestNewAlert(TestCli):
    def test_new_alert(self, capsys):
        self.client.should_receive("new_alert_contact").with_args(type=1, value="uptime@webresourcesdepot.com").and_return("1234")
        parse_cli_args("new-alert uptime@webresourcesdepot.com --type 1".split(" "))
        out, err = capsys.readouterr()
        assert out == "Created alert contact with id: 1234\n"


    def test_new_alert_default_type(self, capsys):
        self.client.should_receive("new_alert_contact").with_args(type=2,value="uptime@webresourcesdepot.com").and_return("1234")
        parse_cli_args("new-alert uptime@webresourcesdepot.com".split(" "))
        out, err = capsys.readouterr()
        assert out == "Created alert contact with id: 1234\n"


    def test_new_alert_bad_type(self):
        with raises(SystemExit):
            parse_cli_args("new-alert uptime@webresourcesdepot.com --type fred".split(" "))


    def test_new_alert_no_args(self):
        with raises(SystemExit):
            parse_cli_args("new-alert".split(" "))


class TestDeleteAlert(TestCli):
    def test_delete_alert_by_id(self, capsys):
        self.client.should_receive("delete_alert_contact").with_args(id="1234").and_return("1234")
        parse_cli_args("delete-alert 1234".split(" "))
        out, err = capsys.readouterr()
        assert out == "Deleted alert contact with id: 1234\n"


    def test_delete_alert_by_name(self):
        alert = flexmock(id="1234", value="fred")
        self.client.should_receive("get_alert_contacts").with_args().and_return([alert])
        self.client.should_receive("delete_alert_contact").with_args(id="1234").and_return("1234")

        parse_cli_args("delete-alert fred".split(" "))


    def test_delete_alert_bad_name(self):
        self.client.should_receive("get_alert_contacts").with_args().and_return([])
        with raises(APIError):
            parse_cli_args("delete-alert fred".split(" "))


    def test_delete_alert_no_args(self):
        with raises(SystemExit):
            parse_cli_args("delete-alert".split(" "))