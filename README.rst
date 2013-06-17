UptimeRobot client
==================

A module (with command line application) to access uptimetobot.com API.

Author: Bil Bas (bil.bas.dev@gmail.com)

License: GPLv3

Tested on Python 2.7 and 3.2.


Installation
------------

    $ pip install uptimerobot


Usage
-----

The command line application
~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The CLI application will take default values from ./.uptimerobot.yml and/or ~/.uptimerobot.yml (at the least, the api_key needs to be defined in one of these)::

    $ uptimerobot -h

    usage: uptimerobot [-h] SUBCOMMAND [OPTION, ...]
                          
    Manage monitors and alert contacts at UptimeRobot.com

    If files exist, application will take defaults from:
        ./.uptimerobot.yml
        ~/.uptimerobot.yml

    optional arguments:
      -h, --help            show this help message and exit

    Subcommands:
        get-monitors        Get information about some or all monitors
        new-monitor         Create a new monitor
        edit-monitor        Edit an existing monitor
        delete-monitor      Delete a monitor
        get-alerts          Get information about some or all alert contacts
        new-alert           Create a new alert contact
        delete-alert        Delete an alert contact


The Python module
~~~~~~~~~~~~~~~~~

Users can use the API directly, via the uptimerobot Client class::

    from uptimerobot import Client

    client = Client("my_api_key")

    monitors = client.get_monitors(ids=[123123, 775643],
                                   show_logs=True,
                                   show_alert_contacts=True)

    for monitor in monitors:
        print(monitor.name)
        print(monitor.status_str)

        for alert_contact in monitor.alert_contacts:
            print(alert_contact.type_str)
            print(alert_contact.value)

        for log in monitor.logs:
            print(log.datetime)