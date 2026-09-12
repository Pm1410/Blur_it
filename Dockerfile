# Use official Python image that is lightweight
FROM python:3.10-slim

# Set the working directory inside the cloud server
WORKDIR /app

# Copy the requirements file and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy your actual Python code into the cloud server
COPY server.py .

# Google Cloud Run expects apps to listen on port 8080
EXPOSE 8080

# Start the FastAPI server on port 8080
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
