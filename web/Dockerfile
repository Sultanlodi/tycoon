FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 5000

# Run with gunicorn for WebSocket support
CMD ["gunicorn", "-w", "1", "-b", "0.0.0.0:5000", "--threads", "100", "app:app"]
