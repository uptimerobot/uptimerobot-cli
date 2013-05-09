from __future__ import absolute_import, division, print_function, unicode_literals

from sys import argv

from argparse import ArgumentParser
from argparse import RawTextHelpFormatter
from termcolor import colored

from . import UptimeRobotError
from .client import Client
from .monitor import Monitor
from .alert_contact import AlertContact


def dict_str(dict):
    str = ""
    for key, value in dict.items():
        str += "  %2d: %s\n" % (key, value)
    return str


def get_monitors(parser):
    command = parser.add_parser('get-monitors', 
                                description="Get information about some or all monitors",
                                help="Get information about some or all monitors")
    command.add_argument('--ids',  metavar="ID", type=str, nargs='+',
                         help='IDs of monitors')

    command.add_argument('--uptime',  metavar="NUM-HOURS", type=int, nargs='+',
                         help='Show custom uptime ratios, for one or more periods (in hours)')

    command.add_argument('--logs', action='store_const', const=True, default=False,
                         help="Show logs associated with this monitor")

    command.add_argument('--log-alerts', action='store_const', const=True, default=False,
                         help="Show logs with their associated alert contacts (ignored without --logs)")

    command.add_argument('--alerts', action='store_const', const=True, default=False,
                         help="shows alert contacts associated with this monitor")

    command.add_argument('--log-timezone', action='store_const', const=True, default=False,
                         help="shows timezone for the logs  (ignored without --logs)")


def new_monitor(parser):
    description = """
Create a new monitor

Type:
%s

Subtype:
%s

Keyword Type:
%s
""" % (dict_str(Monitor.TYPES), dict_str(Monitor.SUBTYPES), dict_str(Monitor.KEYWORD_TYPES))

    command = parser.add_parser('new-monitor',
                                formatter_class=RawTextHelpFormatter, 
                                help="Create a new monitor",
                                description=description)

    command.add_argument('name', metavar='NAME', type=str,
                         help='Friendly name for new monitor')
    command.add_argument('url', metavar='URL', type=str,
                         help='URL for new monitor')
    command.add_argument('type', metavar='TYPE', type=int,
                         help='Type of monitor to create')

    command.add_argument('--subtype', type=int, metavar="N",
                   help='Subtype to monitor')

    command.add_argument('--port', type=int, metavar="N",
                   help='Port to monitor')

    command.add_argument('--keyword-type', type=int, metavar="N",
                   help='Type of keyword to monitor')

    command.add_argument('--keyword', type=str, metavar="STR",
                   help='Keyword to monitor')

    command.add_argument('--username', type=str, metavar="STR",
                   help='HTTP username to use for private site')

    command.add_argument('--password', type=str, metavar="STR",
                   help='HTTP password to use for private site')

    command.add_argument('--alerts', metavar="ID", type=int, nargs='+',
                   help='IDs of alert contacts to use')


def edit_monitor(parser):
    description = """
Edit an existing monitor

Type:
%s

Subtype:
%s

Keyword Type:
%s

Status:
%s
""" % (dict_str(Monitor.TYPES), dict_str(Monitor.SUBTYPES), dict_str(Monitor.KEYWORD_TYPES), dict_str(Monitor.STATUS))

    command = parser.add_parser('edit-monitor', 
                                formatter_class=RawTextHelpFormatter,
                                description=description,
                                help="Edit an existing monitor")

    command.add_argument('id', metavar='ID', type=str,
                   help='ID of monitor to edit')

    command.add_argument('--name', type=str, metavar="STR",
                   help='Friendly name of monitor')

    command.add_argument('--status', type=int, metavar="N",
                   help='Status to set the monitor to')

    command.add_argument('--url', type=str, metavar="STR",
                   help='URL to monitor')

    command.add_argument('--type', type=int, metavar="N",
                   help='Type to monitor')

    command.add_argument('--subtype', type=int, metavar="N",
                   help='Subtype to monitor')

    command.add_argument('--port', type=int, metavar="N",
                   help='Port to monitor')

    command.add_argument('--keyword-type', type=int, metavar="N",
                   help='Type of keyword to monitor')

    command.add_argument('--keyword', type=str, metavar="STR",
                   help='Keyword to monitor')

    command.add_argument('--username', type=str, metavar="STR",
                   help='HTTP username to use for private site')

    command.add_argument('--password', type=str, metavar="STR",
                   help='HTTP password to use for private site')

    command.add_argument('--alerts', metavar="ID", type=str, nargs='+',
                   help='IDs of alert contacts to use')

def delete_monitor(parser):
    command = parser.add_parser('delete-monitor', 
                                description="Delete a monitor",
                                help="Delete a monitor")

    command.add_argument('id', metavar='ID', type=str,
                   help='ID of monitor to delete')


def get_alerts(parser):
    command = parser.add_parser('get-alerts',
                                description="Get information about some or all alert contact",
                                help="Get information about some or all alert contacts")
    command.add_argument('--ids', metavar="ID", type=str, nargs='+',
                         help='IDs of alert contacts')


def new_alert(parser):
    description = """
Create a new alert contact

Type:
%s
""" % dict_str(AlertContact.TYPES)


    command = parser.add_parser('new-alert',
                                formatter_class=RawTextHelpFormatter,
                                description=description,
                                help="Create a new alert contact")
    command.add_argument('type', metavar='TYPE', type=int,
                         help='Type of contact to create')
    command.add_argument('value', metavar='VALUE', type=str,
                         help='Value of contact (email address, sms number, twitter user, iOS device)')


def delete_alert(parser):
    command = parser.add_parser('delete-alert', 
                                description="Delete an alert contact",
                                help="Delete an alert contact")

    command.add_argument('id', metavar='ID', type=str,
                   help='ID of alert contact to delete')


def create_parser():
    parser = ArgumentParser(description="Manage monitors and alert contacts at UptimeRobot.com",
                            usage="uptimerobot [-h] SUBCOMMAND [OPTION, ...]")
    sub_commands = parser.add_subparsers(title='Subcommands',
                                        dest="subcommand")

    get_monitors(sub_commands)
    new_monitor(sub_commands)
    edit_monitor(sub_commands)
    delete_monitor(sub_commands)

    get_alerts(sub_commands)
    new_alert(sub_commands)
    delete_alert(sub_commands)

    return parser


def parse_cli_args(args):
    """
    Parse arguments given to CLI applicationa and run client accordingly
    """

    parser = create_parser()
    opts = parser.parse_args(args)

    client = Client()

    if opts.subcommand == "get-monitors":
        monitors = client.get_monitors(ids=opts.ids,
                                       show_logs=opts.logs,
                                       show_alert_contacts=opts.alerts, 
                                       show_log_alert_contacts=opts.log_alerts, 
                                       show_log_timezone=opts.log_timezone, 
                                       custom_uptime_ratio=opts.uptime)
        for m in monitors:
            m.dump()
            print(colored("-" * 20, "blue"))
            print()

    elif opts.subcommand == "new-monitor":
        id = client.new_monitor(name=opts.name,
                                url=opts.url,
                                type=opts.type,
                                subtype=opts.subtype,
                                port=opts.port,
                                keyword_type=opts.keyword_type,
                                keyword=opts.keyword,
                                username=opts.username,
                                password=opts.password,
                                alert_contacts=opts.alerts)

        print("Created monitor with id: %s" % id)

    elif opts.subcommand == "edit-monitor":
        id = client.edit_monitor(id=opts.id,
                                status=opts.status,
                                name=opts.name,
                                url=opts.url,
                                type=opts.type,
                                subtype=opts.subtype,
                                port=opts.port,
                                keyword_type=opts.keyword_type,
                                keyword=opts.keyword,
                                username=opts.username,
                                password=opts.password,
                                alert_contacts=opts.alerts)

        print("Edited monitor with id: %s" % id)

    elif opts.subcommand == "delete-monitor":
        id = client.delete_monitor(id=opts.id)
        print("Deleted monitor with id: %s" % id)

    elif opts.subcommand == "get-alerts":
        alerts = client.get_alert_contacts(ids=opts.ids)
        for a in alerts:
            a.dump()

    elif opts.subcommand == "new-alert":
        id = client.new_alert_contact(type=opts.type,
                                      value=opts.value)

        print("Created alert contact with id: %s" % id)

    elif opts.subcommand == "delete-alert":
        id = client.delete_alert_contact(id=opts.id)

        print("Deleted alert contact with id: %s" % id)

    else:
        raise Exception("Bad subcommand %s" % opts.subcommand)



def main():
    """Command line access to the API (accessed directly from "uptimerobot" command)."""
    try:
        parse_cli_args(argv[1:])
    except UptimeRobotError as ex:
        print("%s: %s" % (type(ex).__name__, ex), file=stderr)
        exit(1)