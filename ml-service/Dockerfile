# Use Python 3.10 (TensorFlow 2.15 compatible)
FROM python:3.10-slim

# Install system dependencies for ML packages
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    gfortran \
    libopenblas-dev \
    liblapack-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Upgrade pip and install dependencies
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

# Copy project files
COPY . .

# Expose port (Render uses $PORT)
EXPOSE 8000

# Start FastAPI app
CMD ["uvicorn", "ml_service.main_app:app", "--host", "0.0.0.0", "--port", "8000"]
