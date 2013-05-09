from __future__ import absolute_import, division, print_function, unicode_literals

from termcolor import colored

class AlertContact(object):
    TYPES = {
        1: "sms",
        2: "email",
        3: "twitter",
        4: "boxcar (iOS)",
    }

    STATUS = {
        0: "not activated",
        1: "paused",
        2: "active",
    }


    def __init__(self, data):
        self.id = data.get("id", None)
        self.type =  int(data["type"])
        self.value = data["value"]
        self.status = int(data["status"]) if "status" in data else None

    type_str = property(lambda self: self.TYPES[self.type])
    status_str = property(lambda self: self.STATUS[self.status])


    def dump(self):
        # No id/type if inside a log.
        if self.id is not None and self.status is not None:
            if self.status == 2:
                color = "green"
            elif self.status == 0:
                color = "red"
            else:
                color = "yellow"

            status = colored(self.status_str.title(), color)

            # List of alerts
            print("  %s: %s [%s] #%s" % (self.type_str, self.value, status, self.id))
        elif self.id is not None and self.status is None:
            # In monitor.
            print("  %s: %s #%s" % (self.type_str, self.value, self.id))
        else:
            # In log.
            print("  %s: %s" % (self.type_str, self.value))