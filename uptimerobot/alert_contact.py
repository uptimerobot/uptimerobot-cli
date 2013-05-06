from __future__ import absolute_import, division, print_function, unicode_literals

class AlertContact(object):
    TYPE = {
        1: "sms",
        2: "email",
        3: "twitter",
        4: "boxcar",
    }

    STATUS = {
        0: "not activated",
        1: "paused",
        2: "active",
    }


    def __init__(self, data):
        self.id = int(data["id"]) if data.get("id", None) else 0
        self.type =  int(data["type"])
        self.value = data["value"]
        self.status = int(data["type"])

    type_str = property(lambda self: self.TYPE[self.type])
    status_str = property(lambda self: self.STATUS[self.status])


    def dump(self):
        # No id/type if inside a log.
        if self.id:
            print("  %s: %s [%s] #%d" % (self.type_str, self.value, self.status_str.title(), self.id))
        else:
             print("  %s [%s]" % (self.value, self.status_str.title()))