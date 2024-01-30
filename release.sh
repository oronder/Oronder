#!/bin/sh

(pip show click > /dev/null || pip install click) && python ./release.py "$@"