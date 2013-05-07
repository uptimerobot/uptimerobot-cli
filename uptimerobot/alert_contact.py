from __future__ import absolute_import, division, print_function, unicode_literals

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
        self.id = int(data["id"]) if "id" in data else None
        self.type =  int(data["type"])
        self.value = data["value"]
        self.status = int(data["status"]) if "status" in data else None

    type_str = property(lambda self: self.TYPES[self.type])
    status_str = property(lambda self: self.STATUS[self.status])


    def dump(self):
        # No id/type if inside a log.
        if self.id and self.status:
            print("  %s: %s [%s] #%d" % (self.type_str, self.value, self.status_str.title(), self.id))
        elif self.id and not self.status:
            print("  %s: %s #%d" % (self.type_str, self.value, self.id))
        else:
            print("  - %s" % self.value)