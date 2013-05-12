from __future__ import absolute_import, division, print_function, unicode_literals

from datetime import datetime

from termcolor import colored

from .alert_contact import AlertContact

class Log(object):
    TIMESTAMP_FORMAT = "%m/%d/%Y %H:%M:%S"
    TIMESTAMP_FORMAT_ALT = "%m/%d/%Y %H:%M:%S %p"


    class Type:
        DOWN = 1
        UP = 2
        STARTED = 98
        PAUSED = 99

    TYPES = {
        Type.DOWN: "down",
        Type.UP: "up",
        Type.STARTED: "started",
        Type.PAUSED: "paused",
    }

    def __init__(self, data):
        # Sometimes the alert data has no 'value'!
        alert_data = filter(lambda ac: ac.get("value"), data.get("alertcontact", []))

        self.alert_contacts = [AlertContact(ac) for ac in alert_data]

        try:
            self.datetime = datetime.strptime(data["datetime"], self.TIMESTAMP_FORMAT_ALT)
        except ValueError as ex:
            self.datetime = datetime.strptime(data["datetime"], self.TIMESTAMP_FORMAT)

        self.type = int(data["type"])


    type_str = property(lambda self: self.TYPE[self.type])


    def dump(self):
        if self.type == self.Type.UP:
            color = "green"
        elif self.type == self.Type.Down:
            color = "red"
        else:
            color = "yellow"

        status = colored(self.type_str.title(), color)
        print("  %s [%s]" % (self.datetime.strftime(self.TIMESTAMP_FORMAT), status))

        if self.alert_contacts:
            for alert in self.alert_contacts:
                alert.dump()