#!/bin/bash

rm -rf tmp-chrome-profile

export TZ="${TZ:-America/New_York}"

open -na 'Google Chrome' --args "--user-data-dir=$PWD/tmp-chrome-profile"
