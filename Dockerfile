# syntax=docker/dockerfile:1
FROM python:3.13-slim


LABEL maintainer="you@example.com"


ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1


# Устанавливаем системные зависимости, которые могут понадобиться для сборки дополнений (grpcio и т.д.)
RUN apt-get update \
&& apt-get install -y --no-install-recommends \
build-essential \
gcc \
libffi-dev \
libssl-dev \
python3-dev \
git \
&& rm -rf /var/lib/apt/lists/*


WORKDIR /app


# Копируем requirements сначала — для кеширования слоёв
COPY requirements.txt /app/requirements.txt


# Обновляем pip и устанавливаем зависимости
RUN pip install --upgrade pip setuptools wheel \
&& pip install --no-cache-dir -r /app/requirements.txt


# Копируем код приложения
COPY . /app


# Ставим экспозы для документации — не обязательно, но удобно
EXPOSE 8000
EXPOSE 50051


# Замечание: генерация protobuf на этапе билда выполняется, но при монтировании тома
# (docker compose с volumes) файлы, сгенерированные на этапе билда, могут быть "скрыты".
# Поэтому в docker-compose команды дополнительно генерируют pb-файлы при старте контейнера.


# По-умолчанию запускается uvicorn (этот CMD легко переопределяется в docker-compose)
CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]