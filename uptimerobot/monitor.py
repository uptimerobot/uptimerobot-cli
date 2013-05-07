from __future__ import absolute_import, division, print_function, unicode_literals

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

    KEYWORD_TYPES = {
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
        self.alert_contacts = [AlertContact(ac) for ac in data.get("alertcontact", [])]
        self.logs = [Log(log) for log in data.get("log", [])]
        self.custom_uptime_ratio_periods = custom_uptime_ratio_periods

        self.id = int(data["id"])
        self.name = data["friendlyname"]
        self.url = data["url"]
        self.type = int(data["type"])
        self.subtype = int(data["subtype"]) if data["subtype"] else None

        self.keyword_type = int(data["keywordtype"]) if data["keywordtype"] else None
        self.keyword_value = data["keywordvalue"]

        self.http_username = data["httpusername"]
        self.http_password = data["httppassword"]
        self.port = int(data["port"]) if data["port"] else None

        self.status = int(data["status"])
        self.all_time_uptime_ratio = float(data["alltimeuptimeratio"])

        if "customuptimeratio" in data:
            self.custom_uptime_ratio = [float(n) for n in data["customuptimeratio"].split("-")]
        else:
            self.custom_uptime_ratio = []


    @property
    def subtype_str(self):
        if self.subtype:
            return self.SUBTYPES[self.subtype]
        else:
            return None

    keyword_type_str = property(lambda self: self.KEYWORD_TYPES[self.keyword_type])
    type_str = property(lambda self: self.TYPES[self.type])
    status_str = property(lambda self: self.STATUS[self.status])


    def dump(self):
        print("%s [%s] #%d" % (self.name, self.status_str.title(), self.id))
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