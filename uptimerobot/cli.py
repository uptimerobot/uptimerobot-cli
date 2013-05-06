from __future__ import absolute_import, division, print_function, unicode_literals

from argparse import ArgumentParser

from .client import Client


def get_monitors(parser):
    command = parser.add_parser('get-monitors', 
                                description="Get information about some or all monitors",
                                help="Get information about some or all monitors")
    command.add_argument('--ids',  metavar="ID", type=int, nargs='+',
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
    command = parser.add_parser('new-monitor', 
                                description="Create a new monitor",
                                help="Create a new monitor")

    command.add_argument('name', metavar='NAME', type=str,
                         help='Friendly name for new monitor')
    command.add_argument('url', metavar='URL', type=str,
                         help='URL for new monitor')
    command.add_argument('type', metavar='TYPE', type=int,
                         help='Type of monitor to create')


def edit_monitor(parser):
    command = parser.add_parser('edit-monitor', 
                                description="Edit an existing monitor",
                                help="Edit an existing monitor")

    command.add_argument('id', metavar='ID', type=int,
                   help='ID of monitor to edit')


def delete_monitor(parser):
    command = parser.add_parser('delete-monitor', 
                                description="Delete a monitor",
                                help="Delete a monitor")

    command.add_argument('id', metavar='ID', type=int,
                   help='ID of monitor to delete')


def get_alerts(parser):
    command = parser.add_parser('get-alerts',
                                description="Get information about some or all alert contact",
                                help="Get information about some or all alert contacts")
    command.add_argument('--ids', metavar="ID", type=int, nargs='+',
                         help='IDs of alert contacts')


def new_alert(parser):
    command = parser.add_parser('new-alert',
                                description="Create a new alert contact",
                                help="Create a new alert contact")
    command.add_argument('type', metavar='TYPE', type=int,
                         help='Type of contact to create')
    command.add_argument('value', metavar='VALUE', type=str,
                         help='Value of contact (email address, sms number, twitter user, iOS device)')


def delete_alert(parser):
    command = parser.add_parser('delete-alert', 
                                description="Delete an alert contact",
                                help="Delete an alert contact")

    command.add_argument('id', metavar='ID', type=int,
                   help='ID of alert contact to delete')


def create_parser():
    parser = ArgumentParser(description=
        """
        Manage monitors and alert contacts at UptimeRobot.com.

        """)
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
            print("-" * 20)
            print()

    elif opts.subcommand == "new-monitor":
        id = client.new_monitor(friendly_name=opts.name,
                                url=opts.url,
                                type=opts.type)
        print("Created monitor with id: %d" % id)

    elif opts.subcommand == "edit-monitor":
        id = client.edit_monitor(id=opts.id)
        print("Edited monitor with id: %d" % id)

    elif opts.subcommand == "delete-monitor":
        id = client.delete_monitor(id=opts.id)
        print("Deleted monitor with id: %d" % id)

    elif opts.subcommand == "get-alerts":
        alerts = client.get_alert_contacts(ids=opts.ids)
        for a in alerts:
            a.dump()

    elif opts.subcommand == "new-alert":
        id = client.new_alert_contact(type=opts.type,
                                      value=opts.value)

        print("Created alert contact with id: %d" % id)

    elif opts.subcommand == "delete-alert":
        id = client.delete_alert_contact(id=opts.id)

        print("Deleted alert contact with id: %d" % id)

    else:
        raise Exception("Bad subcommand %s" % opts.subcommand)