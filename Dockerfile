# Use a lightweight Python image
FROM python:3.14-slim

# Install system dependencies including FFmpeg
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy the requirements file
COPY requirements.txt .

# Install Python dependencies — no cache so yt-dlp always installs fresh
RUN pip install --no-cache-dir -r requirements.txt

# Force yt-dlp to always upgrade to latest (bypasses Docker layer cache)
RUN pip install --upgrade --no-cache-dir "git+https://github.com/yt-dlp/yt-dlp.git"

# Copy the rest of your application code
COPY . .

# Command to run your application
CMD ["python", "engine.py"]