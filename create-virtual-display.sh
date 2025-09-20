#!/bin/bash

# 在无显示器情况下创建虚拟显示器的几种方法

echo "正在设置虚拟显示器..."

# 方法1: 使用BetterDisplay CLI
if command -v betterdisplaycli &> /dev/null; then
    echo "方法1: 使用BetterDisplay创建虚拟显示器"
    betterdisplaycli create virtual --name "Virtual-HD" --width 2560 --height 1440 --hz 60 || echo "BetterDisplay创建失败"
fi

# 方法2: 使用displayplacer强制设置分辨率
echo "方法2: 尝试使用displayplacer强制设置分辨率"
displayplacer "id:4D9C51B0-EC8B-4DAD-B869-99A0BC9FAE40 res:2560x1440 hz:60 color_depth:4 enabled:true scaling:off origin:(0,0) degree:0" || echo "displayplacer设置失败"

# 方法3: 创建自定义显示器配置
echo "方法3: 创建自定义显示器配置"
cat > /tmp/custom-display.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>DisplayProductID</key>
    <integer>0x9c3d</integer>
    <key>DisplayVendorID</key>
    <integer>0x610</integer>
    <key>DisplaySerialNumber</key>
    <string>virtual-display-1</string>
    <key>DisplayType</key>
    <string>Virtual Display</string>
    <key>DisplayResolution</key>
    <dict>
        <key>Horizontal</key>
        <integer>2560</integer>
        <key>Vertical</key>
        <integer>1440</integer>
    </dict>
</dict>
</plist>
PLIST

echo "配置文件已创建到 /tmp/custom-display.plist"

echo "虚拟显示器设置完成！"
echo "如果需要更多选项，请手动打开BetterDisplay应用进行配置。"
