#!/bin/bash

# Colors for better visibility
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

container_name="blinko-website"
image_name="${BLINKO_IMAGE:-ghcr.io/tossp/blinko:ts}"
backup_dir="blinko-backup-$(date +"%Y%m%d_%H%M%S")"
docker_volume=""

# Pull before stopping a running container; keep the previous image available for rollback.
if ! docker pull "$image_name"; then
  echo -e "${RED}Failed to pull Docker image: $image_name${NC}"
  exit 1
fi

# Step 1: Backup data from the container
echo -e "${YELLOW}🔄 Backing up data from the container...${NC}"

# Create backup directory
mkdir -p "$backup_dir"

# Copy data from the container
if [ "$(docker ps -q -f name=$container_name)" ]; then
  docker cp "${container_name}:/app/.blinko" "$backup_dir"

  if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to backup data from the container. Please check the container name and your Docker setup.${NC}"
    exit 1
  fi

  echo -e "${GREEN}✅ Data backed up to: $backup_dir${NC}"
else
  echo -e "${YELLOW}Container $container_name does not exist. Skipping backup.${NC}"
fi

# Step 2: Check if the container has a volume mounted
volume_path=$(docker inspect -f '{{ range .Mounts }}{{ if eq .Destination "/app/.blinko" }}{{ .Source }}{{ end }}{{ end }}' "$container_name")
if [ -z "$volume_path" ]; then
  echo -e "${YELLOW}No existing volume found for container $container_name.${NC}"
else
  echo -e "${YELLOW}Using existing volume: $volume_path${NC}"
  docker_volume="-v $volume_path:/app/.blinko"
fi

# Step 3: Run the blinko-website container
echo -e "${YELLOW}2. ⏳ Starting the blinko-website container...${NC}"

# Check if the container is already running
if [ "$(docker ps -q -f name=$container_name)" ]; then
  echo -e "${YELLOW}Container $container_name is already running. Restarting...${NC}"
  docker stop "$container_name"
  docker rm "$container_name"
fi


# Run the new container with the existing volume if found
docker run -d \
  --name blinko-website \
  --network blinko-network \
  $docker_volume \
  -p 1111:1111 \
  -e NODE_ENV=production \
  -e NEXTAUTH_SECRET=my_ultra_secure_nextauth_secret \
  -e DATABASE_URL=postgresql://postgres:mysecretpassword@blinko-postgres:5432/postgres \
  --restart always \
  "$image_name"

if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to start Docker container. Please check your Docker setup.${NC}"
  exit 1
fi

echo -e "${GREEN}✅ $container_name is up and running.${NC}"
