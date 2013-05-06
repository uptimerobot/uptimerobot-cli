#!/usr/bin/env python

from __future__ import absolute_import, division, print_function, unicode_literals

from sys import argv
from uptimerobot import parse_cli_args, UptimeRobotError

try:
    parse_cli_args(argv[1:])
except UptimeRobotError as ex:
    print("%s: %s" % (type(ex).__name__, ex))



