# Agent Tool

Hệ thống cần sự hổ trợ của ydotool và pytesseract

## ydottool
```bash
sudo apt install ydotoold
sudo ydotoold --socket-path=/tmp/.ydotool_socket --socket-perm=0666 &
ls -la /tmp/.ydotool_socket
sudo apt install build-essential cmake scdoc libudev-dev
git clone https://github.com/ReimuNotMoe/ydotool.git
cd ydotool
mkdir build && cd build
cmake ..
make -j$(nproc)
sudo make install
```

## OCR
```bash
sudo apt install tesseract-ocr
```