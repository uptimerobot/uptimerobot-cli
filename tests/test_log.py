from __future__ import absolute_import, division, print_function, unicode_literals

import sys, os
import json

import requests
from pytest import raises
from flexmock import flexmock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from uptimerobot.log import Log
from uptimerobot.alert_contact import AlertContact

class TestLog(object):
    def setup(self):
        filename = os.path.join(os.path.dirname(__file__), "data", "log.json")
        with open(filename) as f:
            self.subject = Log(json.load(f))

    def test_init(self):
        assert self.subject.type == 2
        assert self.subject.datetime.year == 2011
        assert self.subject.datetime.hour == 16

        assert len(self.subject.alert_contacts) == 2
        
        assert self.subject.alert_contacts[0].type == 0
        assert self.subject.alert_contacts[0].value == "uptime@webresourcesdepot.com"

        assert self.subject.alert_contacts[1].type == 3
        assert self.subject.alert_contacts[1].value == "umutm"