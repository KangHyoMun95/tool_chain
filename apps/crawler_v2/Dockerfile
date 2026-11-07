FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive TZ=Asia/Bangkok
# --disable-dev-shm-usage: Docker mặc định /dev/shm chỉ 64MB -> Brave dễ crash (bỏ đi nếu compose đã đặt shm_size)
ENV BRAVE_EXTRA_FLAGS="--no-sandbox --disable-dev-shm-usage"
# [v2] log Python ra ngay (không bị buffer) -> docker logs thấy realtime
ENV PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
      curl gnupg xvfb x11vnc procps python3 python3-pip fonts-noto-core tzdata \
 && curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg \
      https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg] https://brave-browser-apt-release.s3.brave.com/ stable main" \
      > /etc/apt/sources.list.d/brave-browser-release.list \
 && apt-get update && apt-get install -y brave-browser \
 && rm -rf /var/lib/apt/lists/*

# Chạy bằng user thường: Brave chạy bằng root sẽ đòi --no-sandbox
RUN useradd -m bot && mkdir -p /tmp/.X11-unix && chmod 1777 /tmp/.X11-unix
# Tạo sẵn thư mục mount với chủ sở hữu bot: named volume mới sẽ kế thừa quyền này
# [v2] thêm output/ : chứa session.json (cookie KUBET + game) -> mount volume để restart container không phải login lại
RUN mkdir -p /home/bot/.brave-automation /home/bot/app/debug /home/bot/app/output \
 && chown -R bot:bot /home/bot/.brave-automation /home/bot/app
USER bot
WORKDIR /home/bot/app

COPY --chown=bot requirements.txt .
RUN pip3 install --user -r requirements.txt     # [v2] playwright, requests, websockets>=13, msgpack
COPY --chown=bot . .
RUN chmod +x start_brave.sh stop_brave.sh

# [v2] Không start Brave / Xvfb trước: main.py tự bật khi cần login KUBET (brave.py) rồi tắt ngay.
#      Chạy lại khi dừng: Docker (restart: on-failure) — exit 1 = chạy lại, exit 0 = dừng hẳn (check bot).
CMD ["python3", "main.py"]
