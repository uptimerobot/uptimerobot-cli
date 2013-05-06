UptimeRobot client
==================

A command line application to access uptimetobot

Author: Bil Bas (bil.bas.dev@gmail.com)

License: Copyright (c) 1013 Bil Bas


Installation
------------

    $ pip install -r requirements.txt


Usage
-----

usage: uptimerobot.py [-h] SUBCOMMAND [OPTIONS]
                      
Manage monitors and alert contacts at UptimeRobot.com.

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


Specification
-------------

www.uptimerobot.com is a web site which allows to monitor up to 50 websites for free. It has an API which allows to create, edit and delete items.

What I need is a way to call this API from the Linux command line (in other words, a wrapper for the API), so that all functions of the API can be accessed from shell scripts. 

The command line utility shall also read default values, such as the account id, from a defaults file so that these values don't need to be given on the command line.

The software can be written in either Java, Perl or Python (this is what is available on my servers by default, I don't want to install extra software if I can avoid it).

Here is the API documentation with examples: http://www.uptimerobot.com/api.asp#examples


Proposal
--------

I would use Python to develop this command-line script, which would be compatible with both Python 2.7 & 3.2. It would be well-documented and commented.

Default values would be held in a configuration file (YAML, JSON or XML), as you request. I have a great deal of experience in creating usable command-line scripts and in dealing with web-services like this (I'd prefer to request JSON responses from the server), so I don't anticipate any problems in development.

"uptimetobot.py" would support "monitors get", "monitor new", "monitors edit", "monitors delete", "alert-contacts get" & "alert-contacts delete" subcommands and give full help on all these functions. Responses would be formatted into a human-readable format.