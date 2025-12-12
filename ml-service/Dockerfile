# ===========================================
# Base image — TensorFlow 2.15 requires Python 3.10
# ===========================================
FROM python:3.10-slim

# ===========================================
# System dependencies for numpy, scipy, sklearn, xgboost
# ===========================================
RUN apt-get update && apt-get install -y \
    build-essential \
    gcc \
    gfortran \
    libatlas-base-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ===========================================
# Set app directory
# ===========================================
WORKDIR /app

# ===========================================
# Install Python dependencies
# ===========================================
COPY requirements.txt .

RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

# ===========================================
# Copy all project files
# ===========================================
COPY . .

# ===========================================
# Expose port (Render overrides with $PORT)
# ===========================================
EXPOSE 8000

# ===========================================
# Start FastAPI using Uvicorn
# ===========================================
CMD ["uvicorn", "main_app:app", "--host", "0.0.0.0", "--port", "8000"]
