# Build context: repo root (see docker-compose.yml). Service: python main.py serve
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY apps/ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/ai/main.py .
COPY apps/ai/src/__init__.py src/
COPY apps/ai/src/patterns src/patterns
# File định nghĩa category (config/categories/*.json): nạp + kiểm tra lúc khởi động, thiếu / sai thì AI không chạy
COPY config config
RUN useradd -m ai
USER ai
CMD ["python", "main.py", "serve"]
