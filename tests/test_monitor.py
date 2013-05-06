from __future__ import absolute_import, division, print_function, unicode_literals

import sys, os
import json

import requests
from pytest import raises
from flexmock import flexmock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from uptimerobot.monitor import Monitor
from uptimerobot.log import Log
from uptimerobot.alert_contact import AlertContact


class TestMonitor(object):
    def setup(self):
        filename = os.path.join(os.path.dirname(__file__), "data", "monitor.json")
        with open(filename) as f:
            self.subject = Monitor(json.load(f))

    def test_init(self):
        assert self.subject.id == 128795
        assert self.subject.name == "Yahoo"
        assert self.subject.url == "http://www.yahoo.com/"

        assert self.subject.all_time_uptime_ratio == 99.98
        assert self.subject.custom_uptime_ratio == [100.0, 99.0]

        assert len(self.subject.alert_contacts) == 2

        assert self.subject.alert_contacts[0].id == 4631
        assert self.subject.alert_contacts[0].type == 2
        assert self.subject.alert_contacts[0].value == "uptime@webresourcesdepot.com"

        assert self.subject.alert_contacts[1].id == 2420
        assert self.subject.alert_contacts[1].type == 3
        assert self.subject.alert_contacts[1].value == "umutm"

        assert len(self.subject.logs) == 2

        assert self.subject.logs[0].type == 2
        assert self.subject.logs[0].datetime.minute == 12
        assert len(self.subject.logs[0].alert_contacts) == 2

        assert self.subject.logs[1].type == 1
        assert self.subject.logs[1].datetime.minute == 11
        assert len(self.subject.logs[1].alert_contacts) == 2
