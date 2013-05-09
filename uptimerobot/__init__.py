from __future__ import absolute_import, division, print_function, unicode_literals

__all__ = ["Client", "UptimeRobotError", "APIError", "HTTPError"]


class UptimeRobotError(Exception):
    pass


class APIError(UptimeRobotError):
    pass


class HTTPError(UptimeRobotError):
    pass


from .client import Client