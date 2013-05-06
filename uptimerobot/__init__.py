from __future__ import absolute_import, division, print_function, unicode_literals

__all__ = ["Client", "parse_cli_args", "UptimeRobotError", "APIError", "HTTPError"]


class UptimeRobotError(Exception):
    pass


class APIError(UptimeRobotError):
    pass


class HTTPError(UptimeRobotError):
    pass


from .client import Client
from .cli import parse_cli_args