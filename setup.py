from __future__ import absolute_import, division, print_function, unicode_literals

from setuptools import setup, find_packages

setup(
    name = "uptimerobot",
    version = "0.1.0",
    description="A module (with command line application) to access uptimetobot.com API",
    author = "Bil Bas",
    author_email = "bil.bas.dev@gmail.com",
    install_requires = [
        "argparse>=1.2.1",
        "requests>=1.2.0",
        "pyyaml>=3.10",
        "termcolor>=1.1.0",
    ],
    packages = find_packages(),
    entry_points = {
        'console_scripts': [
            'uptimerobot = uptimerobot.cli:main',
        ],
    },
    include_package_data=True,
    zip_safe=False,
)