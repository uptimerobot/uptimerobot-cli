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
        self.data = data

    id = property(lambda self: int(self.data["id"]))
    value = property(lambda self: self.data["value"])

    type = property(lambda self: int(self.data["type"]))
    type_str = property(lambda self: self.TYPE[self.type])

    status = property(lambda self: int(self.data["type"]))
    status_str = property(lambda self: self.STATUS[self.status])


    def dump(self, indent=""):
        print("%s[%s] %s - %s (%d)" % (indent, self.type_str, self.value, self.status_str.title(), self.id))