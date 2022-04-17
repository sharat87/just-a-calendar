#!/bin/bash

rm -rf tmp-chrome-profile
TZ="America/New_York" open -na 'Google Chrome' --args "--user-data-dir=$PWD/tmp-chrome-profile"
