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
        self.data = data

        self.alert_contacts = [AlertContact(ac) for ac in data.get("alertcontact", [])]

    type = property(lambda self: int(self.data["type"]))
    type_str = property(lambda self: self.TYPE[self.type])

    @property
    def datetime(self):
        try:
            return datetime.strptime(self.data["datetime"], self.TIMESTAMP_FORMAT_ALT)
        except ValueError as ex:
            return datetime.strptime(self.data["datetime"], self.TIMESTAMP_FORMAT)


    def dump(self):
        print("  %s [%s]" % (self.datetime.strftime(self.TIMESTAMP_FORMAT), self.type_str.title()))

        if self.alert_contacts:
            for alert in self.alert_contacts:
                alert.dump()