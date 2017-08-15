#!/bin/sh
java -Xdebug -Xrunjdwp:transport=dt_socket,address=12345,server=y,suspend=n TestApp