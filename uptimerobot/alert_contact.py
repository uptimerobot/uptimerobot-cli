from __future__ import absolute_import, division, print_function, unicode_literals

class AlertContact(object):
    def __init__(self, data):
        self.data = data

    id = property(lambda self: int(self.data["id"]))
    value = property(lambda self: self.data["value"])
    type = property(lambda self: int(self.data["type"]))

    def __str__(self):
        return "AlertContact: %6d %d %s" % (self.id, self.type, self.value)