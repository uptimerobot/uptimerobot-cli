from __future__ import absolute_import, division, print_function, unicode_literals

from termcolor import colored

class AlertContact(object):
    class Type:
        SMS = 1
        EMAIL = 2
        TWITTER = 3
        BOXCAR = 4

    TYPES = {
        Type.SMS: "sms",
        Type.EMAIL: "email",
        Type.TWITTER: "twitter",
        Type.BOXCAR: "boxcar",
    }

    class Status:
        NOT_ACTIVATED = 0
        PAUSED = 1
        ACTIVE = 2

    STATUSES = {
        Status.NOT_ACTIVATED: "not activated",
        Status.PAUSED: "paused",
        Status.ACTIVE: "active",
    }


    def __init__(self, data):
        self.id = data.get("id", None)
        self.type =  int(data["type"])
        self.value = data["value"]
        self.status = int(data["status"]) if "status" in data else None

    type_str = property(lambda self: self.TYPES[self.type])
    status_str = property(lambda self: self.STATUSES[self.status])


    def dump(self):
        # No id/type if inside a log.
        if self.id is not None and self.status is not None:
            if self.status == self.Status.ACTIVE:
                color = "green"
            elif self.status == self.Status.NOT_ACTIVATED:
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