# Be a breeze (TMAC's chain) witness in minutes.
# You will be an observer node by default.

# Only top 15(may expand in tiers in future) elected nodes can mine dtube blocks on breeze chain.
# Check Block explorer for current stats: 
      https://breezescan.io/#/witness


Step 1.
  1-A. Install docker
    https://docs.docker.com/get-docker/

  1-B. Install docker compose
    https://docs.docker.com/compose/install/

Step 2.
  Build the breeze image using 
  docker-compose build
`
Step 3.
  Update .env file to set ports and other environment variables.

Step 4.
  Run the breeze container and be a observer leader.
  docker-compose up

  How to run a miner node?

Tip appreciated! Mantained by `@fasolo97`.

