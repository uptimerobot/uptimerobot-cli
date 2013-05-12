from __future__ import absolute_import, division, print_function, unicode_literals

from sys import argv, stderr, modules
from argparse import ArgumentParser, RawTextHelpFormatter
import re, os

import yaml
from termcolor import colored

from . import UptimeRobotError, APIError
from .client import Client
from .monitor import Monitor
from .alert_contact import AlertContact


LOCAL_CONFIG_FILE = ".uptimerobot.yml"
USER_CONFIG_FILE = os.path.expanduser(os.path.join("~", LOCAL_CONFIG_FILE))
DEFAULT_CONFIG_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', LOCAL_CONFIG_FILE))


def dict_str(dict):
    """Layout a list of keys and values for the help text"""

    str = ""
    for key, value in dict.items():
        str += "  %2d: %s\n" % (key, value)
    return str


def parse_get_monitors(parser, defaults):
    command = parser.add_parser('get-monitors', 
                                description="Get information about some or all monitors",
                                help="Get information about some or all monitors")

    command.add_argument('--monitors',  metavar="MONITOR", type=str, nargs='+',
                         help='IDs or names of monitors')

    command.add_argument('--uptime', metavar="NUM-HOURS", type=int, nargs='+',
                         default=defaults["uptime"],
                         help='Show custom uptime ratios, for one or more periods (in hours)')

    command.add_argument('--show-log', action='store_true',
                         default=defaults["show_log"], 
                         help="Show logs associated with this monitor")

    command.add_argument('--log-alerts', action='store_true',
                         default=defaults["log_alerts"], 
                         help="Show logs with their associated alert contacts (ignored without --show-log)")

    command.add_argument('--show-alerts', action='store_true',
                         default=defaults["show_alerts"], 
                         help="shows alert contacts associated with this monitor")

    command.add_argument('--log-timezone', action='store_true',
                         default=defaults["log_timezone"], 
                         help="shows timezone for the logs  (ignored without --show-log)")


def parse_new_monitor(parser, defaults):
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

    # Required:
    command.add_argument('name', metavar='NAME', type=str,
                         help='Friendly name for new monitor')

    command.add_argument('url', metavar='URL', type=str,
                         help='URL for new monitor')

    # Options:
    command.add_argument('--type', metavar='N', type=int,
                         choices=Monitor.TYPES.keys(),
                         default=defaults["type"],
                         help='Type of monitor to create')

    command.add_argument('--subtype', type=int, metavar="N",
                         choices=Monitor.SUBTYPES.keys(),
                         default=defaults["subtype"],
                         help='Subtype to monitor')

    command.add_argument('--port', type=int, metavar="N",
                         default=defaults["port"],
                         help='Port to monitor')

    command.add_argument('--keyword-type', type=int, metavar="N",
                         choices=Monitor.KEYWORD_TYPES.keys(),
                         default=defaults["keyword_type"],
                         help='Type of keyword to monitor')

    command.add_argument('--keyword', type=str, metavar="STR",
                         default=defaults["keyword"],
                         help='Keyword to monitor')

    command.add_argument('--username', type=str, metavar="STR",
                         default=defaults["username"],
                         help='HTTP username to use for private site')

    command.add_argument('--password', type=str, metavar="STR",
                         default=defaults["password"],
                         help='HTTP password to use for private site')

    command.add_argument('--alerts', metavar="ALERT", type=str, nargs='+',
                         default=defaults["alerts"],
                         help='IDs / values of alert contacts to use')


def parse_edit_monitor(parser, defaults):
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
""" % (dict_str(Monitor.TYPES), dict_str(Monitor.SUBTYPES), dict_str(Monitor.KEYWORD_TYPES), dict_str(Monitor.STATUSES))

    command = parser.add_parser('edit-monitor', 
                                formatter_class=RawTextHelpFormatter,
                                description=description,
                                help="Edit an existing monitor")

    command.add_argument('id', metavar='ID', type=str,
                         help='ID of monitor to edit')

    command.add_argument('--name', type=str, metavar="STR",
                         default=defaults["name"],
                         help='Friendly name of monitor')

    command.add_argument('--status', type=int, metavar="N",
                         default=defaults["status"],
                         choices=Monitor.STATUSES.keys(),
                         help='Status to set the monitor to')

    command.add_argument('--url', type=str, metavar="STR",
                         default=defaults["url"],
                         help='URL to monitor')

    command.add_argument('--type', type=int, metavar="N",
                         default=defaults["type"],
                         choices=Monitor.TYPES.keys(),
                         help='Type to monitor')

    command.add_argument('--subtype', type=int, metavar="N",
                         default=defaults["subtype"],
                         choices=Monitor.SUBTYPES.keys(),
                         help='Subtype to monitor')

    command.add_argument('--port', type=int, metavar="N",
                         default=defaults["port"],
                         help='Port to monitor')

    command.add_argument('--keyword-type', type=int, metavar="N",
                         default=defaults["keyword_type"],
                         choices=Monitor.KEYWORD_TYPES.keys(),
                         help='Type of keyword to monitor')

    command.add_argument('--keyword', type=str, metavar="STR",
                         default=defaults["keyword"],
                         help='Keyword to monitor')

    command.add_argument('--username', type=str, metavar="STR",
                         default=defaults["username"],
                         help='HTTP username to use for private site')

    command.add_argument('--password', type=str, metavar="STR",
                         default=defaults["password"],
                         help='HTTP password to use for private site')

    command.add_argument('--alerts', metavar="ID", type=str, nargs='+',
                         default=defaults["alerts"],
                         help='IDs of alert contacts to use')


def parse_delete_monitor(parser):
    command = parser.add_parser('delete-monitor', 
                                description="Delete a monitor",
                                help="Delete a monitor")

    command.add_argument('monitor', metavar='MONITOR', type=str,
                         help='ID/name of monitor to delete')


def parse_get_alerts(parser, defaults):
    command = parser.add_parser('get-alerts',
                                description="Get information about some or all alert contact",
                                help="Get information about some or all alert contacts")
    
    command.add_argument('--alerts', metavar="ALERT", type=str, nargs='+',
                         default=defaults["alerts"],
                         help='IDs/values of alert contacts')


def parse_new_alert(parser, defaults):
    description = """
Create a new alert contact

Type:
%s
""" % dict_str(AlertContact.TYPES)


    command = parser.add_parser('new-alert',
                                formatter_class=RawTextHelpFormatter,
                                description=description,
                                help="Create a new alert contact")
    command.add_argument('value', metavar='VALUE', type=str,
                         help='Value of contact (email address, sms number, twitter user, iOS device)')

    command.add_argument('--type', metavar='STR', type=int,
                         choices=AlertContact.TYPES.keys(),
                         default=defaults["type"],
                         help='Type of contact to create')


def parse_delete_alert(parser):
    command = parser.add_parser('delete-alert', 
                                description="Delete an alert contact",
                                help="Delete an alert contact")

    command.add_argument('alert', metavar='ALERT', type=str,
                         help='ID/value of alert contact to delete')


def create_parser(config):
    description = """
Manage monitors and alert contacts at UptimeRobot.com

If file exists, application will take defaults from:
    ./.uptimerobot.yml
    ~/.uptimerobot.yml
    """

    parser = ArgumentParser(description=description,
                            formatter_class=RawTextHelpFormatter,
                            usage="uptimerobot [-h] SUBCOMMAND [OPTION, ...]")
    sub_commands = parser.add_subparsers(title='Subcommands',
                                         dest="subcommand")

    parse_get_monitors(sub_commands, config["get_monitors"])
    parse_new_monitor(sub_commands, config["new_monitor"])
    parse_edit_monitor(sub_commands, config["edit_monitor"])
    parse_delete_monitor(sub_commands)

    parse_get_alerts(sub_commands, config["get_alerts"])
    parse_new_alert(sub_commands, config["new_alert"])
    parse_delete_alert(sub_commands)

    return parser


def get_monitor_ids(client, ids_and_names):
    """Get monitor ids from a list of ids and names"""

    if ids_and_names:
        # Split ids and values.
        ids = list(filter(lambda m: re.match(client.ID_PATTERN, m), ids_and_names))
        names = list(filter(lambda m: not re.match(client.ID_PATTERN, m), ids_and_names))

        # Look up the ids of any values given.
        if names:
            monitors = filter(lambda m: (m.name in names), client.get_monitors())
            ids += [m.id for m in monitors]
    else:
        ids = None

    return ids


def get_alert_contact_ids(client, ids_and_values):
    """Get alert contact ids from a list of ids and values"""

    if ids_and_values:
        # Split ids and values.
        ids = list(filter(lambda a: re.match(client.ID_PATTERN, a), ids_and_values))
        values = list(filter(lambda a: not re.match(client.ID_PATTERN, a), ids_and_values))

        # Look up the ids of any values given.
        if values:
            alerts = filter(lambda a: (a.value in values), client.get_alert_contacts())
            ids += [a.id for a in alerts]
    else:
        ids = None

    return ids


def get_monitors(client, options):
    monitors = get_monitor_ids(client, options.monitors)

    if monitors is not None and len(monitors) == 0:
        raise APIError("Alert contact not found with value: %s" % options.monitors)

    monitors = client.get_monitors(ids=monitors,
                                   show_logs=options.show_log,
                                   show_alert_contacts=options.show_alerts, 
                                   show_log_alert_contacts=options.log_alerts, 
                                   show_log_timezone=options.log_timezone, 
                                   custom_uptime_ratio=options.uptime)
    for m in monitors:
        m.dump()
        print(colored("-" * 20, "blue"))
        print()


def new_monitor(client, options):
    alert_contacts = get_alert_contact_ids(client, options.alerts)

    id = client.new_monitor(name=options.name,
                            url=options.url,
                            type=options.type,
                            subtype=options.subtype,
                            port=options.port,
                            keyword_type=options.keyword_type,
                            keyword=options.keyword,
                            username=options.username,
                            password=options.password,
                            alert_contacts=alert_contacts)

    print("Created monitor with id: %s" % id)


def edit_monitor(client, options):
    alert_contacts = get_alert_contact_ids(client, options.alerts)

    id = client.edit_monitor(id=options.id,
                            status=options.status,
                            name=options.name,
                            url=options.url,
                            type=options.type,
                            subtype=options.subtype,
                            port=options.port,
                            keyword_type=options.keyword_type,
                            keyword=options.keyword,
                            username=options.username,
                            password=options.password,
                            alert_contacts=alert_contacts)

    print("Edited monitor with id: %s" % id)


def delete_monitor(client, options):
    monitors = get_monitor_ids(client, [options.monitor])

    if len(monitors) != 1:
        raise APIError("Monitor not found with name: %s" % options.monitor)
        
    id = client.delete_monitor(id=monitors[0])
    print("Deleted monitor with id: %s" % id)


def get_alerts(client, options):
    alerts = get_alert_contact_ids(client, options.alerts)

    if alerts is not None and len(alerts) == 0:
        raise APIError("No alerts found:: %s" % options.alerts)

    for alert in client.get_alert_contacts(ids=alerts):
        alert.dump()


def new_alert(client, options):
    id = client.new_alert_contact(type=options.type,
                                  value=options.value)

    print("Created alert contact with id: %s" % id)


def delete_alert(client, options):
    alerts = get_alert_contact_ids(client, [options.alert])

    if len(alerts) != 1:
        raise APIError("Alert contact not found with value: %s" % options.alert)

    id = client.delete_alert_contact(id=alerts[0])
    print("Deleted alert contact with id: %s" % id)  


def parse_cli_args(args):
    """
    Parse arguments given to CLI applicationa and run client accordingly
    """

    try:
        # uptimerobot.yml
        with open(LOCAL_CONFIG_FILE) as f:
            config = yaml.load(f)
    except IOError:
        try:
            # ~/.uptimerobot.yml
            with open(USER_CONFIG_FILE) as f:
                config = yaml.load(f)
        except IOError:
            # Defaults.
            with open(DEFAULT_CONFIG_FILE) as f:
                config = yaml.load(f)

    parser = create_parser(config)
    options = parser.parse_args(args)

    client = Client(config["api_key"])

    # Call the handler function dynamically.
    getattr(modules[__name__], options.subcommand.replace("-", "_"))(client, options)


def main():
    """Command line access to the API (accessed directly from "uptimerobot" command)."""
    try:
        parse_cli_args(argv[1:])
    except UptimeRobotError as ex:
        print("%s: %s" % (type(ex).__name__, ex), file=stderr)
        exit(1)
    except ValueError as ex:
        print("Error in parameter value: %s" % ex, file=stderr)
        exit(1)