from __future__ import absolute_import, division, print_function, unicode_literals

from .log import Log
from .alert_contact import AlertContact


class Monitor(object):
    TYPES = {
        1: "http",
        2: "keyword",
        3: "ping",
        4: "port",
    }

    SUBTYPES = {
        1: "http",
        2: "https",
        3: "ftp",
        4: "smtp",
        5: "pop3",
        6: "imap",
        99: "custom",
    }

    KEYWORD_TYPE = {
        1: "exists",
        2: "not exists",
    }

    STATUS = {
        0: "paused",
        1: "not checked yet",
        2: "up",
        8: "seems down",
        9: "down",
    }


    def __init__(self, data):
        self.data = data

        self.alert_contacts = [AlertContact(ac) for ac in data["alertcontact"]]
        self.logs = [Log(log) for log in data["log"]]


    id = property(lambda self: int(self.data["id"]))
    friendly_name = property(lambda self: self.data["friendlyname"])
    url = property(lambda self: self.data["url"])

    type = property(lambda self: int(self.data["type"]))
    subtype = property(lambda self: int(self.data["subtype"]))

    keyword_type = property(lambda self: self.data["keywordtype"])
    keyword_value = property(lambda self: self.data["keywordvalue"])

    http_username = property(lambda self: self.data["httpusername"])
    http_password = property(lambda self: self.data["httppassword"])
    port = property(lambda self: int(self.data["port"]))

    status = property(lambda self: int(self.data["status"]))

    all_time_uptime_ratio = property(lambda self: float(self.data["alltimeuptimeratio"]))
    custom_uptime_ratio = property(lambda self: [float(n) for n in self.data["customuptimeratio"].split("-")])