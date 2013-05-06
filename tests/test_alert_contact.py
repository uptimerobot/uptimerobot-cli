from __future__ import absolute_import, division, print_function, unicode_literals

import sys, os
import json

import requests
from pytest import raises
from flexmock import flexmock

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from uptimerobot.alert_contact import AlertContact

class TestAlertContact(object):
    def setup(self):
        filename = os.path.join(os.path.dirname(__file__), "data", "alert_contact.json")
        with open(filename) as f:
            self.subject = AlertContact(json.load(f))

    def test_init(self):
        assert self.subject.id == 236
        assert self.subject.value == "uptime@webresourcesdepot.com"
        assert self.subject.type == 2