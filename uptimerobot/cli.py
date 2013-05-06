from __future__ import absolute_import, division, print_function, unicode_literals

from argparse import ArgumentParser

from .client import Client


def get_monitors(parser):
    command = parser.add_parser('get-monitors', 
                                description="description",
                                help="Get information of monitors")
    command.add_argument('--ids', type=int, nargs='+',
                         help='IDs of monitors')

def new_monitor(parser):
    command = parser.add_parser('new-monitor', 
                                description="description",
                                help="Create a new monitor")

    command.add_argument('name', metavar='NAME', type=str,
                         help='Friendly name for new monitor')
    command.add_argument('url', metavar='URL', type=str,
                         help='URL for new monitor')
    command.add_argument('type', metavar='TYPE', type=int,
                         help='Type of monitor to create')


def edit_monitor(parser):
    command = parser.add_parser('edit-monitor', 
                                description="description",
                                help="Edit an existing monitor")

    command.add_argument('id', metavar='ID', type=int,
                   help='ID of monitor to edit')


def delete_monitor(parser):
    command = parser.add_parser('delete-monitor', 
                                description="description",
                                help="Delete a monitor")

    command.add_argument('id', metavar='ID', type=int,
                   help='ID of monitor to delete')


def get_alerts(parser):
    command = parser.add_parser('get-alerts',
                                description="description",
                                help="Get list of alert contacts")
    command.add_argument('--ids', type=int, nargs='+',
                         help='IDs of alert contacts')


def new_alert(parser):
    command = parser.add_parser('new-alert',
                                description="description",
                                help="Create a new alert contact")
    command.add_argument('type', metavar='TYPE', type=int,
                         help='Type of contact to create')
    command.add_argument('value', metavar='EMAIL', type=str,
                         help='Email address of contact')


def delete_alert(parser):
    command = parser.add_parser('delete-alert', 
                                description="description",
                                help="Delete an alert contact")

    command.add_argument('id', metavar='ID', type=int,
                   help='ID of alert contact to delete')


def create_parser():
    parser = ArgumentParser(description='Process some integers.')
    sub_commands = parser.add_subparsers(title='subcommands',
                                        description='valid subcommands',
                                        help='additional help',
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
        monitors = client.get_monitors(ids=opts.ids)
        print("Monitors:")
        [print(m) for m in monitors]

    elif opts.subcommand == "new-monitor":
        id = client.new_monitor(name=opts.name,
                                url=opts.url,
                                type=opts.type)
        print("Created monitor with id: %d" % id)

    elif opts.subcommand == "edit-monitor":
        client.edit_monitor(id=opts.id)

    elif opts.subcommand == "delete-monitor":
        id = client.delete_monitor(id=opts.id)
        print("Deleted monitor with id: %d" % id)

    elif opts.subcommand == "get-alerts":
        alerts = client.get_alert_contacts(ids=opts.ids)
        print("Alert contacts:")
        [print(a) for a in alerts]

    elif opts.subcommand == "new-alert":
        id = client.new_alert_contact(type=opts.type,
                                      value=opts.value)

        print("Created alert contact with id: %d" % id)

    elif opts.subcommand == "delete-alert":
        id = client.delete_alert_contact(id=opts.id)

        print("Deleted alert contact with id: %d" % id)

    else:
        raise Exception("Bad subcommand %s" % opts.subcommand)