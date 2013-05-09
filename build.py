#!/usr/bin/env python

from __future__ import absolute_import, division, print_function, unicode_literals

from os import system
from sys import stderr

from argparse import ArgumentParser

USAGE = "build.py [-h] ACTION"

parser = ArgumentParser(description="Manage building docs and release package",
                        usage=USAGE)

parser.add_argument('command', metavar='ACTION', type=str,
                    help='Build either "docs" or "release"')

opts = parser.parse_args()

if opts.command == "docs":
    # Generate documentation.
    system("sphinx-apidoc -o doc uptimerobot")
    system("python setup.py build_sphinx")
    print()
    print("HTML documentation generated: build/sphinx/html/index.html")
elif opts.command == "release":
    # Create source distribution.
    system("python setup.py sdist")
    print()
    print("Distribution package created in dist/")
else:
    print('Invalid action (must be "docs" or "release")', file=stderr)
    print("usage: %s" % USAGE, file=stderr)
    exit(1)

