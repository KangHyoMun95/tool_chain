# Build context: apps/ai (see docker-compose.yml). Service: python main.py serve
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .
COPY src/__init__.py src/
COPY src/patterns src/patterns
RUN useradd -m ai
USER ai
CMD ["python", "main.py", "serve"]
