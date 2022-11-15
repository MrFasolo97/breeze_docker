#!/bin/bash

docker build -t breeze
# alternative: docker-compose build

sleep 5

docker rm breeze
docker run -it -v $HOME/breeze/blocks:/breeze/blocks -v $HOME/breeze/mongodb:/var/lib/mongodb -p 3001:3001 -p 6001:6001 --name breeze breeze:latest ./scripts/start_breeze.sh
# alternative: docker-compose down && docker-compose up
