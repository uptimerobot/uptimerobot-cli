from __future__ import absolute_import, division, print_function, unicode_literals

from math import log10

from .log import Log
from .alert_contact import AlertContact


class Monitor(object):
    TYPES = {
        1: "http(s)",
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


    def __init__(self, data, custom_uptime_ratio_periods=[]):
        self._data = data

        self.alert_contacts = [AlertContact(ac) for ac in data.get("alertcontact", [])]
        self.logs = [Log(log) for log in data.get("log", [])]
        self.custom_uptime_ratio_periods = custom_uptime_ratio_periods


    id = property(lambda self: int(self._data["id"]))
    friendly_name = property(lambda self: self._data["friendlyname"])
    url = property(lambda self: self._data["url"])

    type = property(lambda self: int(self._data["type"]))
    type_str = property(lambda self: self.TYPES[self.type])

    subtype = property(lambda self: int(self._data["subtype"]) if self._data["subtype"] else None)
    @property
    def subtype_str(self):
        if self._data["subtype"]:
            return self.SUBTYPES[int(self._data["subtype"])]
        else:
            return None

    keyword_type = property(lambda self: int(self._data["keywordtype"]) if self._data["keywordtype"] else None)
    keyword_type_str = property(lambda self: self.KEYWORD_TYPE[self.keyword_type])
    keyword_value = property(lambda self: self._data["keywordvalue"])

    http_username = property(lambda self: self._data["httpusername"])
    http_password = property(lambda self: self._data["httppassword"])
    port = property(lambda self: int(self._data["port"]) if self._data["port"] else None)

    status = property(lambda self: int(self._data["status"]))
    status_str = property(lambda self: self.STATUS[self.status])


    all_time_uptime_ratio = property(lambda self: float(self._data["alltimeuptimeratio"]))
    @property
    def custom_uptime_ratio(self):
        if "customuptimeratio" in self._data:
            return [float(n) for n in self._data["customuptimeratio"].split("-")]
        else:
            return []


    def dump(self):
        print("%s [%s] #%d" % (self.friendly_name, self.status_str.title(), self.id))
        print("URL: %s" % self.url)

        if self.port:
            print("Port: %d", self.port)

        if self.http_username:
            print("User: %s (%s)" % self.http_username, self.http_password)

        print("Type: %s" % self.type_str)
        print("All Time Uptime Ratio:         %.2f%%" % self.all_time_uptime_ratio)

        if self.custom_uptime_ratio:
            for period, ratio in zip(self.custom_uptime_ratio_periods, self.custom_uptime_ratio):
                str = "Uptime Ratio over %d hour%s:" % (period, "" if period == 1 else "s")
                print("%-30s %.2f%%" % (str, ratio))

        if self.subtype:
            print("Subtype: %s" % self.subtype_str)

        if self.keyword_type:
            print("Keyword: %s %s" % (self.keyword_value, self.keyword_type_str))

        if self.alert_contacts:
            print()
            print("Alert contacts:")
            for alert in self.alert_contacts:
                alert.dump()

        if self.logs:
            print()
            print("Log:")
            for log in self.logs:
                log.dump()
                print()