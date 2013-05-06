from __future__ import absolute_import, division, print_function, unicode_literals

from datetime import datetime

from .alert_contact import AlertContact

class Log(object):
    TIMESTAMP_FORMAT = "%m/%d/%Y %H:%M:%S"
    TIMESTAMP_FORMAT_ALT = "%m/%d/%Y %H:%M:%S %p"


    TYPE = {
        1: "down",
        2: "up",
        98: "started",
        99: "paused",
    }

    def __init__(self, data):
        self.alert_contacts = [AlertContact(ac) for ac in data.get("alertcontact", [])]

        try:
            self.datetime = datetime.strptime(data["datetime"], self.TIMESTAMP_FORMAT_ALT)
        except ValueError as ex:
            self.datetime = datetime.strptime(data["datetime"], self.TIMESTAMP_FORMAT)

        self.type = int(data["type"])


    type_str = property(lambda self: self.TYPE[self.type])


    def dump(self):
        print("  %s [%s]" % (self.datetime.strftime(self.TIMESTAMP_FORMAT), self.type_str.title()))

        if self.alert_contacts:
            for alert in self.alert_contacts:
                alert.dump()