from __future__ import absolute_import, division, print_function, unicode_literals

from datetime import datetime

from .alert_contact import AlertContact

class Log(object):
    TIMESTAMP_FORMAT = "%m/%d/%Y %H:%M:%S"

    def __init__(self, data):
        self.data = data

        self.alert_contacts = [AlertContact(ac) for ac in data["alertcontact"]]

    type = property(lambda self: int(self.data["type"]))
    datetime = property(lambda self: datetime.strptime(self.data["datetime"], self.TIMESTAMP_FORMAT))