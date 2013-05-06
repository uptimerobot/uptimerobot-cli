#!/usr/bin/env python

from __future__ import absolute_import, division, print_function, unicode_literals

from argparse import ArgumentParser
import yaml

from uptimerobot import *


def get_monitors(parser):
    command = parser.add_parser('get-monitors', 
                                description="description",
                                help="Get list of monitor")
    command.add_argument('integers', metavar='N', type=int, nargs='+',
                   help='an integer for the accumulator')


def new_monitor(parser):
    command = parser.add_parser('new-monitor', 
                                description="description",
                                help="Create a new monitor")


def delete_monitor(parser):
    command = parser.add_parser('delete-monitor', 
                                description="description",
                                help="Delete a monitor")


def get_alerts(parser):
    command = parser.add_parser('get-alert',
                                description="description",
                                help="Get list of alert contacts")

def new_alert(parser):
    command = parser.add_parser('get-alert',
                                description="description",
                                help="Create a new alert contact")


def delete_alert(parser):
    command = parser.add_parser('delete-alert', 
                                description="description",
                                help="Delete an alert contact")


def parse_args():
    parser = ArgumentParser(description='Process some integers.')
    sub_commands = parser.add_subparsers(title='subcommands',
                                        description='valid subcommands',
                                        help='additional help')

    get_monitors(sub_commands)
    new_monitor(sub_commands)
    delete_monitor(sub_commands)

    get_alerts(sub_commands)
    new_alert(subcommands)
    delete_alert(sub_commands)

    return parser.parse_args()


if __name__ == "__main__":
    parse_args()