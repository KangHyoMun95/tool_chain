FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive TZ=Asia/Bangkok
ENV BRAVE_EXTRA_FLAGS="--no-sandbox"

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
# Tạo sẵn thư mục mount với chủ sở hữu bot: named volume mới sẽ kế thừa quyền này (nếu không sẽ là root và Brave không ghi được profile)
RUN mkdir -p /home/bot/.brave-automation /home/bot/app/debug && chown -R bot:bot /home/bot/.brave-automation /home/bot/app
USER bot
WORKDIR /home/bot/app

COPY --chown=bot requirements.txt .
RUN pip3 install --user -r requirements.txt     # playwright, websockets, msgpack...
COPY --chown=bot . .

CMD ["bash", "run_server.sh"]