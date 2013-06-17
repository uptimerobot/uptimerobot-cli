#!/usr/bin/env python

# Doesn't like Python3 stuff, so don't include this.
#from __future__ import absolute_import, division, print_function, unicode_literals

from setuptools import setup, find_packages

setup(
    name = "uptimerobot",
    version = "1.0.1",
    url = "https:/github.com/spooner",
    description = "A module (with command line application) to access uptimetobot.com API",
    author = "Bil Bas",
    author_email = "bil.bas.dev@gmail.com",
    maintainer = "Arne Schirmacher",
    #maintainer_email = "",
    #url= "",
    license = "GNU General Public License v3 (GPLv3)",
    install_requires = [
        "requests>=1.2.0",
        "pyyaml>=3.10",
        "termcolor>=1.1.0",
    ],
    packages = find_packages(),
    package_data = {
        'uptimerobot': [".uptimerobot.yml"],
    },
    entry_points = {
        'console_scripts': [
            'uptimerobot = uptimerobot.cli:main',
        ],
    },
    #include_package_data=True,
    zip_safe=True,
    classifiers=[
        'Development Status :: 4 - Beta',
        #'Development Status :: 5 - Production/Stable',
        'Environment :: Console',
        'Intended Audience :: Developers',
        'Intended Audience :: System Administrators',
        'License :: OSI Approved :: GNU General Public License v3 (GPLv3)',
        'Operating System :: MacOS :: MacOS X',
        'Operating System :: Microsoft :: Windows',
        'Operating System :: POSIX',
        'Programming Language :: Python',
        'Topic :: System :: Networking :: Monitoring',
    ],
)