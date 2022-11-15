#!/bin/bash
echo "Following are the environment variables"
env
echo "Starting the mongodb database"
mongod --dbpath /var/lib/mongodb > /breeze/log/mongodb.log &
sleep 2
echo "Running breeze node"
node restartMining.js &
echo
echo "Cleaning log folder..."
rm /breeze/log/*
touch /breeze/log/breeze.log
secs=5
msg=" ..."
while [ $secs -gt 0 ]
do
    printf "\r\033[KStarting in %.d seconds $msg" $((secs--))
    sleep 1
done
echo
tail -f log/breeze.log
